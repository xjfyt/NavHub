use crate::{
    config::StorageBackend,
    error::AppResult,
    state::AppState,
};
use axum::{extract::{Query, State}, Json};
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

pub async fn list_wallpapers(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<WallpaperListResponse>> {
    let limit = q.limit.unwrap_or(24).clamp(1, 100);
    let offset = q.offset.unwrap_or(0).max(0);

    let search = q.q.as_deref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(format!("%{t}%")) }
    });

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM remote_wallpapers
         WHERE is_active = true
           AND (expires_at IS NULL OR expires_at > now())
           AND ($1::text IS NULL OR media_type = $1)
           AND ($2::text IS NULL OR title ILIKE $2)",
    )
    .bind(q.media_type.as_deref())
    .bind(search.as_deref())
    .fetch_one(&state.pg)
    .await?;

    let rows: Vec<ListRow> = sqlx::query_as(
        "SELECT rw.id, rw.source_id, ws.name AS source_name, rw.title, rw.original_url,
                rw.page_url, rw.storage_key, rw.thumbnail_key, rw.thumbnail_url,
                rw.media_type, rw.file_size_bytes, rw.author, rw.fetched_at
         FROM remote_wallpapers rw
         LEFT JOIN wallpaper_sources ws ON ws.id = rw.source_id
         WHERE rw.is_active = true
           AND (rw.expires_at IS NULL OR rw.expires_at > now())
           AND ($1::text IS NULL OR rw.media_type = $1)
           AND ($2::text IS NULL OR rw.title ILIKE $2)
         ORDER BY
           CASE WHEN rw.source_id = '00000000-0000-0000-0000-000000000001'::uuid THEN 0 ELSE 1 END,
           rw.fetched_at DESC
         LIMIT $3 OFFSET $4",
    )
    .bind(q.media_type.as_deref())
    .bind(search.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pg)
    .await?;

    let use_presign = matches!(state.storage.backend(), StorageBackend::S3);

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let url = if let Some(ref key) = row.storage_key {
            if use_presign {
                state.storage.presign_get_url(key).await.unwrap_or_else(|_| format!("/uploads/{key}"))
            } else {
                format!("/uploads/{key}")
            }
        } else {
            row.original_url.clone()
        };

        let thumbnail_url = if let Some(ref tkey) = row.thumbnail_key {
            let tu = if use_presign {
                state.storage.presign_get_url(tkey).await.unwrap_or_else(|_| format!("/uploads/{tkey}"))
            } else {
                format!("/uploads/{tkey}")
            };
            Some(tu)
        } else {
            row.thumbnail_url.clone()
        };

        items.push(WallpaperItem {
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
        });
    }

    Ok(Json(WallpaperListResponse { items, total }))
}
