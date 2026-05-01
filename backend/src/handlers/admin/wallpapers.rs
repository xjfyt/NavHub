use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{
        wallpaper::{CreateWallpaperSourceReq, RemoteWallpaper, UpdateWallpaperSourceReq, WallpaperSource},
        SessionUser,
    },
    scraper::get_scraper,
    state::AppState,
    storage::StorageBackendState,
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
pub struct ListWallpapersQuery {
    pub source_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_sources(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Vec<WallpaperSource>>> {
    require_at_least_admin(user.role)?;
    let rows = sqlx::query_as::<_, WallpaperSource>(
        "SELECT ws.id, ws.name, ws.site_url, ws.enabled, ws.fetch_batch_size,
                ws.cache_ttl_hours, ws.fetch_interval_hours, ws.source_type, ws.scraper_type,
                ws.last_fetched_at,
                (SELECT COUNT(*)::int FROM remote_wallpapers WHERE source_id = ws.id) AS total_fetched,
                ws.created_at, ws.updated_at
         FROM wallpaper_sources ws
         ORDER BY ws.created_at ASC",
    )
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}

pub async fn create_source(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(req): Json<CreateWallpaperSourceReq>,
) -> AppResult<Json<WallpaperSource>> {
    require_at_least_admin(user.role)?;
    if req.name.trim().is_empty() || req.site_url.trim().is_empty() {
        return Err(AppError::BadRequest("name and siteUrl required".into()));
    }
    let row = sqlx::query_as::<_, WallpaperSource>(
        "INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *",
    )
    .bind(req.name.trim())
    .bind(req.site_url.trim())
    .bind(req.enabled.unwrap_or(true))
    .bind(req.fetch_batch_size.unwrap_or(10).max(1).min(50))
    .bind(req.cache_ttl_hours.unwrap_or(168).max(1))
    .bind(req.fetch_interval_hours.unwrap_or(24).max(1))
    .bind(req.source_type.as_deref().unwrap_or("video"))
    .bind(req.scraper_type.as_deref().unwrap_or("desktophut"))
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(row))
}

pub async fn update_source(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateWallpaperSourceReq>,
) -> AppResult<Json<WallpaperSource>> {
    require_at_least_admin(user.role)?;
    let existing = sqlx::query_as::<_, WallpaperSource>("SELECT * FROM wallpaper_sources WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;

    let row = sqlx::query_as::<_, WallpaperSource>(
        "UPDATE wallpaper_sources SET
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
    .bind(req.fetch_batch_size.unwrap_or(existing.fetch_batch_size).max(1).min(50))
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
    sqlx::query("DELETE FROM wallpaper_sources WHERE id = $1")
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
    let source = sqlx::query_as::<_, WallpaperSource>("SELECT * FROM wallpaper_sources WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;

    tokio::spawn(async move {
        if let Err(e) = run_fetch(&state, &source).await {
            tracing::error!("wallpaper fetch failed for source {}: {e}", source.id);
        }
    });

    Ok(Json(serde_json::json!({ "status": "started" })))
}

pub async fn list_wallpapers(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Query(q): Query<ListWallpapersQuery>,
) -> AppResult<Json<Vec<RemoteWallpaper>>> {
    require_at_least_admin(user.role)?;
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = if let Some(sid) = q.source_id {
        sqlx::query_as::<_, RemoteWallpaper>(
            "SELECT * FROM remote_wallpapers WHERE source_id = $1 ORDER BY fetched_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(sid)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pg)
        .await?
    } else {
        sqlx::query_as::<_, RemoteWallpaper>(
            "SELECT * FROM remote_wallpapers ORDER BY fetched_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pg)
        .await?
    };
    Ok(Json(rows))
}

pub async fn delete_wallpaper(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    sqlx::query("DELETE FROM remote_wallpapers WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Core fetch logic: scrape a source and store wallpapers in MinIO + DB.
/// Called both from the background task and the manual trigger endpoint.
pub async fn run_fetch(state: &Arc<AppState>, source: &WallpaperSource) -> anyhow::Result<()> {
    if !source.enabled {
        return Ok(());
    }

    tracing::info!("fetching wallpapers from source '{}' ({})", source.name, source.site_url);

    let scraper = get_scraper(&source.scraper_type);
    let scraped = scraper.scrape(&source.site_url, source.fetch_batch_size as usize).await?;

    tracing::info!("scraped {} wallpapers, downloading...", scraped.len());

    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; NavHub/1.0)")
        .timeout(std::time::Duration::from_secs(120))
        .build()?;

    let max_size_bytes: u64 = 100 * 1024 * 1024; // 100 MB limit per file
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(source.cache_ttl_hours as i64);
    let mut stored_count = 0u32;

    for item in &scraped {
        // Skip if already in DB
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM remote_wallpapers WHERE source_id = $1 AND original_url = $2)",
        )
        .bind(source.id)
        .bind(&item.video_url)
        .fetch_one(&state.pg)
        .await
        .unwrap_or(false);

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
            Ok((storage_key, file_size)) => {
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
                    .map(|(k, _)| k)
                } else {
                    None
                };

                let res = sqlx::query(
                    "INSERT INTO remote_wallpapers
                        (source_id, title, original_url, page_url, storage_key, thumbnail_key, thumbnail_url, media_type, file_size_bytes, author, expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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

    tracing::info!("fetch complete: stored {stored_count} new wallpapers from '{}'", source.name);
    Ok(())
}

async fn download_to_storage(
    client: &reqwest::Client,
    storage: &StorageBackendState,
    url: &str,
    prefix: &str,
    max_bytes: u64,
) -> anyhow::Result<(String, u64)> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("http {} downloading {url}", resp.status());
    }

    // Check content-length if available
    if let Some(cl) = resp.content_length() {
        if cl > max_bytes {
            anyhow::bail!("file too large: {cl} bytes > {max_bytes}");
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_string();

    let bytes: Bytes = resp.bytes().await?;
    if bytes.len() as u64 > max_bytes {
        anyhow::bail!("file too large after download: {} bytes", bytes.len());
    }

    let ext = ext_from_content_type(&content_type, url);
    let hash = {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(&bytes);
        hex::encode(h.finalize())
    };

    let storage_key = format!("{prefix}/{hash}.{ext}");
    let file_size = bytes.len() as u64;
    storage.put_bytes(&storage_key, Some(&content_type), bytes).await?;

    Ok((storage_key, file_size))
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
