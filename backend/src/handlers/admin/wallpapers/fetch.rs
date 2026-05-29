use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{wallpaper::WallpaperSource, SessionUser},
    scraper::{get_scraper, is_wallpaper_dimensions},
    state::AppState,
    storage::Storage,
};
use axum::{
    extract::{Path, State},
    Extension, Json,
};
use bytes::Bytes;
use std::sync::Arc;
use uuid::Uuid;

pub async fn trigger_fetch(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    require_at_least_admin(user.role)?;
    let source =
        sqlx::query_as::<_, WallpaperSource>("SELECT * FROM wallpaper_sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pg)
            .await?
            .ok_or(AppError::NotFound)?;

    if source.scraper_type == "manual" {
        return Err(AppError::BadRequest(
            "manual sources are upload-only, use the upload endpoint instead".into(),
        ));
    }

    // INFRA-4: 不再裸 tokio::spawn 脱管。改为通过 bg_tasks(TaskTracker)跟踪,
    // 优雅关停时可排空;并先拿 admin_fetch_sem 许可限流,避免反复点击堆出无界并发。
    // tracker 与 state 都是 Arc 背书的廉价 clone,先取出再 spawn 以免闭包借用冲突。
    let sem = state.admin_fetch_sem.clone();
    let tracker = state.bg_tasks.clone();
    let task_state = state.clone();
    tracker.spawn(async move {
        let _permit = match sem.acquire_owned().await {
            Ok(p) => p,
            Err(_) => return, // semaphore 已关闭(关停中),直接放弃。
        };
        if let Err(e) = run_fetch(&task_state, &source).await {
            tracing::error!("wallpaper fetch failed for source {}: {e}", source.id);
        }
    });

    Ok(Json(serde_json::json!({ "status": "started" })))
}

/// Core fetch logic: scrape a source and store wallpapers in MinIO + DB.
/// Called both from the background task and the manual trigger endpoint.
pub async fn run_fetch(state: &Arc<AppState>, source: &WallpaperSource) -> anyhow::Result<()> {
    if !source.enabled || source.scraper_type == "manual" {
        return Ok(());
    }

    tracing::info!(
        "fetching wallpapers from source '{}' ({})",
        source.name,
        source.site_url
    );

    let scraper = get_scraper(&source.scraper_type)?;
    let scraped = scraper
        .scrape(&source.site_url, source.fetch_batch_size as usize)
        .await?;

    tracing::info!("scraped {} wallpapers, downloading...", scraped.len());

    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; NavHub/1.0)")
        // INFRA-1: 增加连接超时,避免慢/恶意主机拖住建连阶段。
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
        // SEC-10: 禁用自动重定向,防止 302 跳到内网/云元数据绕过 SSRF 校验。
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let max_size_bytes: u64 = 100 * 1024 * 1024; // 100 MB limit per file
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(source.cache_ttl_hours as i64);
    let mut stored_count = 0u32;

    for item in &scraped {
        // Skip if already in DB
        // QUAL-12: 此前用 .unwrap_or(false) 吞掉 DB 错误——瞬时连接故障会被当成「记录
        // 不存在」,导致重新下载并重复入库(浪费带宽 + S3 对象)。改为 ? 向上传播错误,
        // 让整次抓取失败回退,而不是在错误状态下继续重复落库。
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM remote_wallpapers WHERE source_id = $1 AND original_url = $2)",
        )
        .bind(source.id)
        .bind(&item.video_url)
        .fetch_one(&state.pg)
        .await?;

        if exists {
            tracing::debug!("already cached: {}", item.video_url);
            continue;
        }

        // Download video
        match download_to_storage(
            &http,
            &state.storage,
            &item.video_url,
            "wallpapers/remote",
            max_size_bytes,
        )
        .await
        {
            Ok((storage_key, file_size, width, height)) => {
                if item.media_type == "image" && !is_downloaded_quality_wallpaper(width, height) {
                    tracing::info!(
                        "skipping low quality wallpaper {:?}: dimensions {:?}x{:?}",
                        item.title,
                        width,
                        height
                    );
                    continue;
                }

                // Download thumbnail if available
                let thumb_key = if let Some(ref thumb_url) = item.thumbnail_url {
                    download_to_storage(
                        &http,
                        &state.storage,
                        thumb_url,
                        "wallpapers/remote/thumbs",
                        5 * 1024 * 1024,
                    )
                    .await
                    .ok()
                    .map(|(k, _, _, _)| k)
                } else {
                    None
                };

                let res = sqlx::query(
                    "INSERT INTO remote_wallpapers
                        (source_id, title, original_url, page_url, storage_key, thumbnail_key, thumbnail_url, media_type, file_size_bytes, width, height, author, expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                     ON CONFLICT (source_id, original_url) DO NOTHING",
                )
                .bind(source.id)
                .bind(&item.title)
                .bind(&item.video_url)
                .bind(&item.page_url)
                .bind(&storage_key)
                .bind(&thumb_key)
                .bind(&item.thumbnail_url)
                .bind(&item.media_type)
                .bind(file_size as i64)
                .bind(width)
                .bind(height)
                .bind(&item.author)
                .bind(expires_at)
                .execute(&state.pg)
                .await;

                match res {
                    Ok(r) if r.rows_affected() > 0 => {
                        stored_count += 1;
                        tracing::info!("stored wallpaper: {:?}", item.title);
                    }
                    Ok(_) => {} // conflict, already exists
                    Err(e) => tracing::warn!("db insert failed: {e}"),
                }
            }
            Err(e) => {
                tracing::warn!("download failed for {}: {e}", item.video_url);
                // Still record the URL so we can serve it directly
                let _ = sqlx::query(
                    "INSERT INTO remote_wallpapers
                        (source_id, title, original_url, page_url, thumbnail_url, media_type, author, expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (source_id, original_url) DO NOTHING",
                )
                .bind(source.id)
                .bind(&item.title)
                .bind(&item.video_url)
                .bind(&item.page_url)
                .bind(&item.thumbnail_url)
                .bind(&item.media_type)
                .bind(&item.author)
                .bind(expires_at)
                .execute(&state.pg)
                .await;
                stored_count += 1;
            }
        }
    }

    // Update last_fetched_at and total_fetched
    sqlx::query(
        "UPDATE wallpaper_sources SET last_fetched_at = now(), total_fetched = total_fetched + $2, updated_at = now() WHERE id = $1",
    )
    .bind(source.id)
    .bind(stored_count as i32)
    .execute(&state.pg)
    .await?;

    tracing::info!(
        "fetch complete: stored {stored_count} new wallpapers from '{}'",
        source.name
    );
    Ok(())
}

/// Read pixel dimensions from image header bytes. Returns (None, None) for
/// videos/unsupported/corrupt inputs; never panics. Cheap (header-only parse).
pub(super) fn measure_image_dimensions(bytes: &[u8]) -> (Option<i32>, Option<i32>) {
    match imagesize::blob_size(bytes) {
        Ok(s) => (Some(s.width as i32), Some(s.height as i32)),
        Err(_) => (None, None),
    }
}

fn is_downloaded_quality_wallpaper(width: Option<i32>, height: Option<i32>) -> bool {
    match (width, height) {
        (Some(w), Some(h)) if w > 0 && h > 0 => is_wallpaper_dimensions(w as u32, h as u32),
        _ => false,
    }
}

async fn download_to_storage(
    client: &reqwest::Client,
    storage: &Storage,
    url: &str,
    prefix: &str,
    max_bytes: u64,
) -> anyhow::Result<(String, u64, Option<i32>, Option<i32>)> {
    // QUAL-8: SEC-10 SSRF 校验 + 状态/Content-Length 预检 + SEC-6 限额流式读取,统一走
    // 共享 helper(与图标抓取共用);客户端的禁重定向由调用方保证(见 SEC-10)。
    let (bytes, content_type): (Bytes, String) =
        crate::handlers::util::fetch_remote_capped(client, url, max_bytes).await?;

    let ext = ext_from_content_type(&content_type, url);
    let file_size = bytes.len() as u64;

    // INFRA-2: SHA-256 哈希与 imagesize 测量都是 CPU 密集型,放在异步执行器上
    // 会阻塞 tokio 运行时(大文件尤甚)。挪到 spawn_blocking。Bytes 是 Arc 背书,
    // clone 仅是计数 +1,不复制底层数据。行为与原先完全一致。
    let bytes_for_cpu = bytes.clone();
    let (hash, width, height) = tokio::task::spawn_blocking(move || {
        let hash = crate::handlers::util::sha256_hex(&bytes_for_cpu);
        let (width, height) = measure_image_dimensions(&bytes_for_cpu);
        (hash, width, height)
    })
    .await
    .map_err(|e| anyhow::anyhow!("hash/measure task failed: {e}"))?;

    let storage_key = format!("{prefix}/{hash}.{ext}");
    storage
        .put_bytes(&storage_key, Some(&content_type), bytes)
        .await?;

    Ok((storage_key, file_size, width, height))
}

fn ext_from_content_type(content_type: &str, url: &str) -> &'static str {
    // Try extension from URL first
    let url_lower = url.split('?').next().unwrap_or(url).to_lowercase();
    if url_lower.ends_with(".mp4") {
        return "mp4";
    }
    if url_lower.ends_with(".webm") {
        return "webm";
    }
    if url_lower.ends_with(".jpg") || url_lower.ends_with(".jpeg") {
        return "jpg";
    }
    if url_lower.ends_with(".png") {
        return "png";
    }
    if url_lower.ends_with(".webp") {
        return "webp";
    }

    // Fall back to content-type
    match content_type {
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/ogg" | "video/ogv" => "ogv",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}
