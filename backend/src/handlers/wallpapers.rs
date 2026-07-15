use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct ListRow {
    id: Uuid,
    source_id: Uuid,
    source_name: Option<String>,
    title: Option<String>,
    original_url: String,
    page_url: Option<String>,
    storage_key: Option<String>,
    thumbnail_key: Option<String>,
    thumbnail_url: Option<String>,
    media_type: String,
    file_size_bytes: Option<i64>,
    author: Option<String>,
    fetched_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub media_type: Option<String>,
    pub source_id: Option<Uuid>,
    /// Free-text title search
    pub q: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem {
    pub id: Uuid,
    pub source_id: Uuid,
    pub source_name: Option<String>,
    pub title: Option<String>,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub page_url: Option<String>,
    pub media_type: String,
    pub author: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub fetched_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperListResponse {
    pub items: Vec<WallpaperItem>,
    pub total: i64,
}

fn stable_upload_url(key: &str) -> String {
    let encoded = key
        .split('/')
        .map(|part| urlencoding::encode(part).into_owned())
        .collect::<Vec<_>>()
        .join("/");
    format!("/uploads/{encoded}")
}

fn wallpaper_item(row: ListRow) -> WallpaperItem {
    // Never expose a presigned S3 URL to the browser. Wallpaper selections and
    // the shuffle snapshot are persisted by the frontend, while presigned URLs
    // expire after at most 24 hours. The stable same-origin route creates a
    // fresh short-lived redirect every time the object is requested.
    let url = row
        .storage_key
        .as_deref()
        .map(stable_upload_url)
        .unwrap_or_else(|| row.original_url.clone());

    let thumbnail_url = if let Some(ref key) = row.thumbnail_key {
        Some(stable_upload_url(key))
    } else if row.media_type == "image" && row.storage_key.is_some() {
        Some(url.clone())
    } else {
        // This is retained for old video rows without a cached thumbnail. New
        // image rows always use a MinIO-backed stable URL above.
        row.thumbnail_url.clone()
    };

    WallpaperItem {
        id: row.id,
        source_id: row.source_id,
        source_name: row.source_name,
        title: row.title,
        url,
        thumbnail_url,
        page_url: row.page_url,
        media_type: row.media_type,
        author: row.author,
        file_size_bytes: row.file_size_bytes,
        fetched_at: row.fetched_at,
    }
}

pub async fn list_wallpapers(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<WallpaperListResponse>> {
    let limit = q.limit.unwrap_or(24).clamp(1, 100);
    let offset = q.offset.unwrap_or(0).max(0);

    let search = q.q.as_deref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(format!("%{t}%"))
        }
    });

    // Guest list intentionally skips rows with `storage_key IS NULL`: those are
    // entries the scraper found but failed to download into MinIO (网络/源被墙等),
    // so they would render as the original external URL — invariably slow or
    // outright unreachable for end users behind GFW. The admin view is allowed
    // to see them so the operator can decide to refetch or delete.
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM remote_wallpapers
         WHERE is_active = true
           AND storage_key IS NOT NULL
           AND (expires_at IS NULL OR expires_at > now())
           AND ($1::text IS NULL OR media_type = $1)
           AND ($2::text IS NULL OR title ILIKE $2)
           AND ($3::uuid IS NULL OR source_id = $3)",
    )
    .bind(q.media_type.as_deref())
    .bind(search.as_deref())
    .bind(q.source_id)
    .fetch_one(&state.pg)
    .await?;

    let rows: Vec<ListRow> = sqlx::query_as(
        "SELECT rw.id, rw.source_id, ws.name AS source_name, rw.title, rw.original_url,
                rw.page_url, rw.storage_key, rw.thumbnail_key, rw.thumbnail_url,
                rw.media_type, rw.file_size_bytes, rw.author, rw.fetched_at
         FROM remote_wallpapers rw
         LEFT JOIN wallpaper_sources ws ON ws.id = rw.source_id
         WHERE rw.is_active = true
           AND rw.storage_key IS NOT NULL
           AND (rw.expires_at IS NULL OR rw.expires_at > now())
           AND ($1::text IS NULL OR rw.media_type = $1)
           AND ($2::text IS NULL OR rw.title ILIKE $2)
           AND ($3::uuid IS NULL OR rw.source_id = $3)
         ORDER BY rw.fetched_at DESC
         LIMIT $4 OFFSET $5",
    )
    .bind(q.media_type.as_deref())
    .bind(search.as_deref())
    .bind(q.source_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pg)
    .await?;

    let items = rows.into_iter().map(wallpaper_item).collect();

    Ok(Json(WallpaperListResponse { items, total }))
}

/// Resolve a persisted remote wallpaper id to fresh, stable object URLs.
/// This repairs preferences created by older frontend versions that stored an
/// already-expired S3 presigned URL alongside the id.
pub async fn get_wallpaper(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<WallpaperItem>> {
    let row: Option<ListRow> = sqlx::query_as(
        "SELECT rw.id, rw.source_id, ws.name AS source_name, rw.title, rw.original_url,
                rw.page_url, rw.storage_key, rw.thumbnail_key, rw.thumbnail_url,
                rw.media_type, rw.file_size_bytes, rw.author, rw.fetched_at
         FROM remote_wallpapers rw
         LEFT JOIN wallpaper_sources ws ON ws.id = rw.source_id
         WHERE rw.id = $1
           AND rw.is_active = true
           AND rw.storage_key IS NOT NULL
           AND (rw.expires_at IS NULL OR rw.expires_at > now())",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?;

    Ok(Json(wallpaper_item(row.ok_or(AppError::NotFound)?)))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PublicWallpaperSource {
    pub id: Uuid,
    pub name: String,
    pub source_type: String,
    pub scraper_type: String,
    pub total_count: i64,
}

/// Public list of wallpaper sources that have at least one cached wallpaper.
/// Used by the preferences/admin UIs to populate the "filter by source" dropdown.
pub async fn list_sources(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<PublicWallpaperSource>>> {
    let rows: Vec<PublicWallpaperSource> = sqlx::query_as(
        "SELECT ws.id, ws.name, ws.source_type, ws.scraper_type,
                COUNT(rw.id)::bigint AS total_count
         FROM wallpaper_sources ws
         LEFT JOIN remote_wallpapers rw
           ON rw.source_id = ws.id
          AND rw.is_active = true
          AND rw.storage_key IS NOT NULL
          AND (rw.expires_at IS NULL OR rw.expires_at > now())
         GROUP BY ws.id, ws.name, ws.source_type, ws.scraper_type, ws.created_at
         HAVING COUNT(rw.id) > 0
         ORDER BY ws.created_at ASC",
    )
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}

#[cfg(test)]
mod tests {
    use super::stable_upload_url;

    #[test]
    fn stable_upload_url_preserves_path_and_encodes_segments() {
        assert_eq!(
            stable_upload_url("wallpapers/remote/a b#1.webp"),
            "/uploads/wallpapers/remote/a%20b%231.webp"
        );
    }
}
