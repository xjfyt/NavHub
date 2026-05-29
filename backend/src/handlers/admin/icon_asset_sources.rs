use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{
        icon_asset::{
            CreateIconAssetSourceReq, IconAssetSource, RemoteIconAsset, UpdateIconAssetSourceReq,
        },
        SessionUser,
    },
    scraper::get_icon_scraper,
    state::AppState,
    storage::Storage,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension, Json,
};
use bytes::Bytes;
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIconAssetsQuery {
    pub source_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
}

pub async fn list_sources(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Vec<IconAssetSource>>> {
    require_at_least_admin(user.role)?;
    let rows = sqlx::query_as::<_, IconAssetSource>(
        "SELECT ws.id, ws.name, ws.site_url, ws.enabled, ws.fetch_batch_size,
                ws.cache_ttl_hours, ws.fetch_interval_hours, ws.source_type, ws.scraper_type,
                ws.last_fetched_at,
                (SELECT COUNT(*)::int FROM remote_icon_assets WHERE source_id = ws.id) AS total_fetched,
                ws.created_at, ws.updated_at
         FROM icon_asset_sources ws
         ORDER BY ws.created_at ASC",
    )
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}

pub async fn create_source(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(req): Json<CreateIconAssetSourceReq>,
) -> AppResult<Json<IconAssetSource>> {
    require_at_least_admin(user.role)?;
    if req.name.trim().is_empty() || req.site_url.trim().is_empty() {
        return Err(AppError::BadRequest("name and siteUrl required".into()));
    }
    let row = sqlx::query_as::<_, IconAssetSource>(
        "INSERT INTO icon_asset_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *",
    )
    .bind(req.name.trim())
    .bind(req.site_url.trim())
    .bind(req.enabled.unwrap_or(true))
    .bind(req.fetch_batch_size.unwrap_or(50).clamp(1, 200))
    .bind(req.cache_ttl_hours.unwrap_or(168).max(1))
    .bind(req.fetch_interval_hours.unwrap_or(24).max(1))
    .bind(req.source_type.as_deref().unwrap_or("svg"))
    .bind(req.scraper_type.as_deref().unwrap_or("simpleicons"))
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(row))
}

pub async fn update_source(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateIconAssetSourceReq>,
) -> AppResult<Json<IconAssetSource>> {
    require_at_least_admin(user.role)?;
    let existing =
        sqlx::query_as::<_, IconAssetSource>("SELECT * FROM icon_asset_sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pg)
            .await?
            .ok_or(AppError::NotFound)?;

    let row = sqlx::query_as::<_, IconAssetSource>(
        "UPDATE icon_asset_sources SET
            name = $2,
            site_url = $3,
            enabled = $4,
            fetch_batch_size = $5,
            cache_ttl_hours = $6,
            fetch_interval_hours = $7,
            source_type = $8,
            scraper_type = $9,
            updated_at = now()
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .bind(req.name.as_deref().unwrap_or(&existing.name).trim())
    .bind(req.site_url.as_deref().unwrap_or(&existing.site_url).trim())
    .bind(req.enabled.unwrap_or(existing.enabled))
    .bind(
        req.fetch_batch_size
            .unwrap_or(existing.fetch_batch_size)
            .clamp(1, 200),
    )
    .bind(
        req.cache_ttl_hours
            .unwrap_or(existing.cache_ttl_hours)
            .max(1),
    )
    .bind(
        req.fetch_interval_hours
            .unwrap_or(existing.fetch_interval_hours)
            .max(1),
    )
    .bind(req.source_type.as_deref().unwrap_or(&existing.source_type))
    .bind(
        req.scraper_type
            .as_deref()
            .unwrap_or(&existing.scraper_type),
    )
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(row))
}

pub async fn delete_source(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    sqlx::query("DELETE FROM icon_asset_sources WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn trigger_fetch(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    require_at_least_admin(user.role)?;
    let source =
        sqlx::query_as::<_, IconAssetSource>("SELECT * FROM icon_asset_sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pg)
            .await?
            .ok_or(AppError::NotFound)?;

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
            tracing::error!("icon fetch failed for source {}: {e}", source.id);
        }
    });

    Ok(Json(serde_json::json!({ "status": "started" })))
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminIconAssetListResponse {
    pub items: Vec<RemoteIconAsset>,
    pub total: i64,
}

pub async fn list_icons(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Query(q): Query<ListIconAssetsQuery>,
) -> AppResult<Json<AdminIconAssetListResponse>> {
    require_at_least_admin(user.role)?;
    // API-5: 收紧分页参数,避免 limit=0/超大或负 offset。
    let (limit, offset) =
        crate::handlers::util::clamp_page(q.limit.unwrap_or(100), q.offset.unwrap_or(0));

    let search_pattern = q
        .search
        .as_deref()
        .map(|s| format!("%{}%", s.to_lowercase()));

    let (items, total) = if let Some(sid) = q.source_id {
        if let Some(pat) = &search_pattern {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets WHERE source_id = $1 AND LOWER(title) LIKE $2")
                .bind(sid).bind(pat).fetch_one(&state.pg).await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE source_id = $1 AND LOWER(title) LIKE $2 ORDER BY fetched_at DESC, id DESC LIMIT $3 OFFSET $4")
                .bind(sid).bind(pat).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        } else {
            let total: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets WHERE source_id = $1")
                    .bind(sid)
                    .fetch_one(&state.pg)
                    .await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE source_id = $1 ORDER BY fetched_at DESC, id DESC LIMIT $2 OFFSET $3")
                .bind(sid).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        }
    } else {
        if let Some(pat) = &search_pattern {
            let total: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM remote_icon_assets WHERE LOWER(title) LIKE $1",
            )
            .bind(pat)
            .fetch_one(&state.pg)
            .await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE LOWER(title) LIKE $1 ORDER BY fetched_at DESC, id DESC LIMIT $2 OFFSET $3")
                .bind(pat).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        } else {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets")
                .fetch_one(&state.pg)
                .await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets ORDER BY fetched_at DESC, id DESC LIMIT $1 OFFSET $2")
                .bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        }
    };
    Ok(Json(AdminIconAssetListResponse { items, total }))
}

pub async fn delete_icon(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    // API-3: 删除图标后,被影响来源的 total_fetched 必须随之回算,否则计数只增不减。
    // 用 RETURNING source_id 拿到归属来源,再按 COUNT 重算(最稳妥,避免计数漂移)。
    let source_id: Option<Uuid> =
        sqlx::query_scalar("DELETE FROM remote_icon_assets WHERE id = $1 RETURNING source_id")
            .bind(id)
            .fetch_optional(&state.pg)
            .await?;
    if let Some(sid) = source_id {
        sqlx::query(
            "UPDATE icon_asset_sources
                SET total_fetched = (SELECT COUNT(*)::int FROM remote_icon_assets WHERE source_id = $1),
                    updated_at = now()
              WHERE id = $1",
        )
        .bind(sid)
        .execute(&state.pg)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn run_fetch(state: &Arc<AppState>, source: &IconAssetSource) -> anyhow::Result<()> {
    if !source.enabled {
        return Ok(());
    }

    tracing::info!(
        "fetching icons from source '{}' ({})",
        source.name,
        source.site_url
    );

    let scraper = get_icon_scraper(&source.scraper_type)?;
    let scraped = scraper
        .scrape(&source.site_url, source.fetch_batch_size as usize)
        .await?;

    tracing::info!("scraped {} icons, downloading...", scraped.len());

    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; NavHub/1.0)")
        // INFRA-1: 增加连接超时,避免慢/恶意主机拖住建连阶段。
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        // SEC-10: 禁用自动重定向,防止 302 跳到内网/云元数据绕过 SSRF 校验。
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let max_size_bytes: u64 = 50 * 1024 * 1024; // 50 MB limit per SVG
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(source.cache_ttl_hours as i64);
    let mut stored_count = 0u32;

    for item in &scraped {
        // QUAL-12: 此前用 .unwrap_or(false) 吞掉 DB 错误——瞬时连接故障会被当成「记录
        // 不存在」,导致重新下载并重复入库(浪费带宽 + S3 对象)。改为 ? 向上传播错误。
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM remote_icon_assets WHERE source_id = $1 AND original_url = $2)",
        )
        .bind(source.id)
        .bind(&item.svg_url)
        .fetch_one(&state.pg)
        .await?;

        if exists {
            continue;
        }

        let (storage_key_opt, file_size) = match download_to_storage(
            &http,
            &state.storage,
            &item.svg_url,
            "icons/remote",
            max_size_bytes,
        )
        .await
        {
            Ok((key, size)) => (Some(key), Some(size as i64)),
            Err(e) => {
                // API-6: 下载失败或 SVG 被活动内容扫描拒绝时,跳过整条记录,
                // 不再插入仅含元数据的空壳行(避免落库被拒/不可用的图标)。
                tracing::warn!("download/scan failed for {}: {e}", item.svg_url);
                continue;
            }
        };

        let res = sqlx::query(
            "INSERT INTO remote_icon_assets
                (source_id, title, original_url, storage_key, media_type, file_size_bytes, author, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (source_id, original_url) DO NOTHING",
        )
        .bind(source.id)
        .bind(&item.title)
        .bind(&item.svg_url)
        .bind(&storage_key_opt)
        .bind("svg")
        .bind(file_size)
        .bind(&item.author)
        .bind(expires_at)
        .execute(&state.pg)
        .await;

        match res {
            Ok(r) if r.rows_affected() > 0 => {
                stored_count += 1;
            }
            Ok(_) => {} // conflict, already exists
            Err(e) => {
                let msg = e.to_string();
                tracing::warn!("db insert failed: {msg}");
                if msg.contains("violates foreign key constraint") {
                    tracing::warn!("source was deleted, aborting fetch");
                    break;
                }
            }
        }
    }

    sqlx::query(
        "UPDATE icon_asset_sources SET last_fetched_at = now(), total_fetched = total_fetched + $2, updated_at = now() WHERE id = $1",
    )
    .bind(source.id)
    .bind(stored_count as i32)
    .execute(&state.pg)
    .await?;

    tracing::info!(
        "fetch complete: stored {stored_count} new icons from '{}'",
        source.name
    );
    Ok(())
}

async fn download_to_storage(
    client: &reqwest::Client,
    storage: &Storage,
    url: &str,
    prefix: &str,
    max_bytes: u64,
) -> anyhow::Result<(String, u64)> {
    // QUAL-8: SEC-10 SSRF 校验 + 状态/Content-Length 预检 + SEC-6 限额流式读取,统一走
    // 共享 helper(与壁纸抓取共用);客户端的禁重定向由调用方保证(见 SEC-10)。
    // content-type 此处忽略:图标一律按 SVG 处理。
    let (bytes, _content_type): (Bytes, String) =
        crate::handlers::util::fetch_remote_capped(client, url, max_bytes).await?;

    // API-6: 抓取来的 SVG 此前直接入库,绕过了手动上传所做的活动内容清洗。这里统一
    // 走共享扫描器:含 <script>/事件处理器/javascript: 等的 SVG 一律拒绝,不入库。
    crate::handlers::util::scan_svg_for_active_content(&bytes)
        .map_err(|reason| anyhow::anyhow!("scraped SVG rejected ({reason}): {url}"))?;

    let ext = "svg";
    let file_size = bytes.len() as u64;

    // INFRA-2: SHA-256 哈希是 CPU 密集型,放到 spawn_blocking 避免阻塞运行时(共享 helper)。
    let hash = crate::handlers::util::sha256_hex_blocking(bytes.clone()).await?;

    let storage_key = format!("{prefix}/{hash}.{ext}");
    storage
        .put_bytes(&storage_key, Some("image/svg+xml"), bytes)
        .await?;

    Ok((storage_key, file_size))
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRemoteIconReq {
    pub title: Option<String>,
    pub original_url: String,
    pub storage_key: String,
    pub file_size_bytes: i64,
}

pub async fn add_manual_icons(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(source_id): Path<Uuid>,
    Json(reqs): Json<Vec<AddRemoteIconReq>>,
) -> AppResult<(StatusCode, Json<serde_json::Value>)> {
    require_at_least_admin(user.role)?;
    // API-2: 之前用 ON CONFLICT DO UPDATE,导致已存在的行也被算作「新增」(更新同样
    // 计入 rows_affected),计数虚高。改为 DO NOTHING + RETURNING id,仅统计真正插入的
    // 新行。
    let mut count: i64 = 0;
    for req in reqs {
        let inserted: Option<Uuid> = sqlx::query_scalar(
            "INSERT INTO remote_icon_assets
                (source_id, title, original_url, storage_key, media_type, file_size_bytes, author, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
             ON CONFLICT (source_id, original_url) DO NOTHING
             RETURNING id",
        )
        .bind(source_id)
        .bind(req.title)
        .bind(req.original_url)
        .bind(req.storage_key)
        .bind("svg")
        .bind(req.file_size_bytes)
        .bind("Admin Upload")
        .fetch_optional(&state.pg)
        .await?;
        if inserted.is_some() {
            count += 1;
        }
    }
    // API-2/API-3: total_fetched 以 COUNT 重算,避免在并发或重复上传下计数漂移。
    sqlx::query(
        "UPDATE icon_asset_sources
            SET total_fetched = (SELECT COUNT(*)::int FROM remote_icon_assets WHERE source_id = $1),
                updated_at = now()
          WHERE id = $1",
    )
    .bind(source_id)
    .execute(&state.pg)
    .await?;
    Ok((StatusCode::OK, Json(serde_json::json!({ "added": count }))))
}
