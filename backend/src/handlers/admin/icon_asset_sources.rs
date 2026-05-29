use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{
        icon_asset::{CreateIconAssetSourceReq, RemoteIconAsset, UpdateIconAssetSourceReq, IconAssetSource},
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
    let existing = sqlx::query_as::<_, IconAssetSource>("SELECT * FROM icon_asset_sources WHERE id = $1")
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
    .bind(req.fetch_batch_size.unwrap_or(existing.fetch_batch_size).clamp(1, 200))
    .bind(req.cache_ttl_hours.unwrap_or(existing.cache_ttl_hours).max(1))
    .bind(req.fetch_interval_hours.unwrap_or(existing.fetch_interval_hours).max(1))
    .bind(req.source_type.as_deref().unwrap_or(&existing.source_type))
    .bind(req.scraper_type.as_deref().unwrap_or(&existing.scraper_type))
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
    let source = sqlx::query_as::<_, IconAssetSource>("SELECT * FROM icon_asset_sources WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;

    tokio::spawn(async move {
        if let Err(e) = run_fetch(&state, &source).await {
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
    let limit = q.limit.unwrap_or(100).min(500);
    let offset = q.offset.unwrap_or(0);

    let search_pattern = q.search.as_deref().map(|s| format!("%{}%", s.to_lowercase()));

    let (items, total) = if let Some(sid) = q.source_id {
        if let Some(pat) = &search_pattern {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets WHERE source_id = $1 AND LOWER(title) LIKE $2")
                .bind(sid).bind(pat).fetch_one(&state.pg).await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE source_id = $1 AND LOWER(title) LIKE $2 ORDER BY fetched_at DESC, id DESC LIMIT $3 OFFSET $4")
                .bind(sid).bind(pat).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        } else {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets WHERE source_id = $1")
                .bind(sid).fetch_one(&state.pg).await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE source_id = $1 ORDER BY fetched_at DESC, id DESC LIMIT $2 OFFSET $3")
                .bind(sid).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        }
    } else {
        if let Some(pat) = &search_pattern {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets WHERE LOWER(title) LIKE $1")
                .bind(pat).fetch_one(&state.pg).await?;
            let rows = sqlx::query_as::<_, RemoteIconAsset>("SELECT * FROM remote_icon_assets WHERE LOWER(title) LIKE $1 ORDER BY fetched_at DESC, id DESC LIMIT $2 OFFSET $3")
                .bind(pat).bind(limit).bind(offset).fetch_all(&state.pg).await?;
            (rows, total)
        } else {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_icon_assets")
                .fetch_one(&state.pg).await?;
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
    sqlx::query("DELETE FROM remote_icon_assets WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn run_fetch(state: &Arc<AppState>, source: &IconAssetSource) -> anyhow::Result<()> {
    if !source.enabled {
        return Ok(());
    }

    tracing::info!("fetching icons from source '{}' ({})", source.name, source.site_url);

    let scraper = get_icon_scraper(&source.scraper_type);
    let scraped = scraper.scrape(&source.site_url, source.fetch_batch_size as usize).await?;

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
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM remote_icon_assets WHERE source_id = $1 AND original_url = $2)",
        )
        .bind(source.id)
        .bind(&item.svg_url)
        .fetch_one(&state.pg)
        .await
        .unwrap_or(false);

        if exists {
            continue;
        }

        let (storage_key_opt, file_size) = match download_to_storage(
            &http,
            &state.storage,
            &item.svg_url,
            "icons/remote",
            max_size_bytes,
        ).await {
            Ok((key, size)) => (Some(key), Some(size as i64)),
            Err(e) => {
                tracing::warn!("download failed for {}: {e}", item.svg_url);
                (None, None)
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

    tracing::info!("fetch complete: stored {stored_count} new icons from '{}'", source.name);
    Ok(())
}

async fn download_to_storage(
    client: &reqwest::Client,
    storage: &Storage,
    url: &str,
    prefix: &str,
    max_bytes: u64,
) -> anyhow::Result<(String, u64)> {
    // SEC-10: 抓取来的 URL 其内容站点可控,下载前做 SSRF 校验(禁私网/内网/云元数据);
    // 下载客户端已禁用自动重定向,避免 302 跳转绕过校验。
    let host = crate::handlers::favicon::extract_host(url)
        .ok_or_else(|| anyhow::anyhow!("invalid download url: {url}"))?;
    crate::handlers::favicon::ensure_safe_target(&host, false)
        .await
        .map_err(|e| anyhow::anyhow!("blocked download target {host}: {e:?}"))?;

    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("http {} downloading {url}", resp.status());
    }

    if let Some(cl) = resp.content_length() {
        if cl > max_bytes {
            anyhow::bail!("file too large: {cl} bytes > {max_bytes}");
        }
    }

    // SEC-6: 流式读取并限额。
    let bytes: Bytes = crate::handlers::util::read_body_capped(resp, max_bytes).await?;

    let ext = "svg";
    let file_size = bytes.len() as u64;

    // INFRA-2: SHA-256 哈希是 CPU 密集型,放到 spawn_blocking 避免阻塞运行时。
    // Bytes 是 Arc 背书,clone 不复制底层数据。
    let bytes_for_cpu = bytes.clone();
    let hash = tokio::task::spawn_blocking(move || {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(&bytes_for_cpu);
        hex::encode(h.finalize())
    })
    .await
    .map_err(|e| anyhow::anyhow!("hash task failed: {e}"))?;

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
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    let mut count = 0;
    for req in reqs {
        let res = sqlx::query(
            "INSERT INTO remote_icon_assets 
                (source_id, title, original_url, storage_key, media_type, file_size_bytes, author, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
             ON CONFLICT (source_id, original_url) DO UPDATE SET updated_at = now()",
        )
        .bind(source_id)
        .bind(req.title)
        .bind(req.original_url)
        .bind(req.storage_key)
        .bind("svg")
        .bind(req.file_size_bytes)
        .bind("Admin Upload")
        .execute(&state.pg)
        .await?;
        if res.rows_affected() > 0 {
            count += 1;
        }
    }
    sqlx::query("UPDATE icon_asset_sources SET total_fetched = total_fetched + $2, updated_at = now() WHERE id = $1")
        .bind(source_id)
        .bind(count as i32)
        .execute(&state.pg)
        .await?;
    Ok(StatusCode::OK)
}
