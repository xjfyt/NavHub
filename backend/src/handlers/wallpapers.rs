use crate::{
    config::StorageBackend,
    error::AppResult,
    models::wallpaper::RemoteWallpaper,
    state::AppState,
};
use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

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
    pub title: Option<String>,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub page_url: Option<String>,
    pub media_type: String,
    pub author: Option<String>,
}

pub async fn list_wallpapers(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<WallpaperItem>>> {
    let limit = q.limit.unwrap_or(24).max(1).min(100);
    let offset = q.offset.unwrap_or(0).max(0);

    let search = q.q.as_deref().map(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(format!("%{t}%")) }
    }).flatten();

    let rows: Vec<RemoteWallpaper> = sqlx::query_as(
        "SELECT * FROM remote_wallpapers
         WHERE is_active = true
           AND (expires_at IS NULL OR expires_at > now())
           AND ($1::text IS NULL OR media_type = $1)
           AND ($2::text IS NULL OR title ILIKE $2)
         ORDER BY
           -- Builtin source first, then by fetched_at desc
           CASE WHEN source_id = '00000000-0000-0000-0000-000000000001'::uuid THEN 0 ELSE 1 END,
           fetched_at DESC
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
            title: row.title,
            url,
            thumbnail_url,
            page_url: row.page_url,
            media_type: row.media_type,
            author: row.author,
        });
    }

    Ok(Json(items))
}
