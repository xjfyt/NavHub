use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{
        wallpaper::{CreateWallpaperSourceReq, UpdateWallpaperSourceReq, WallpaperSource},
        SessionUser,
    },
    state::AppState,
    storage::Storage,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use std::sync::Arc;
use uuid::Uuid;

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
    if req.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    let is_manual = req.scraper_type.as_deref() == Some("manual");
    if !is_manual && req.site_url.trim().is_empty() {
        return Err(AppError::BadRequest("siteUrl required".into()));
    }
    let row = sqlx::query_as::<_, WallpaperSource>(
        "INSERT INTO wallpaper_sources (name, site_url, enabled, fetch_batch_size, cache_ttl_hours, fetch_interval_hours, source_type, scraper_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *",
    )
    .bind(req.name.trim())
    .bind(req.site_url.trim())
    .bind(req.enabled.unwrap_or(true))
    .bind(req.fetch_batch_size.unwrap_or(10).clamp(1, 50))
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
    let existing =
        sqlx::query_as::<_, WallpaperSource>("SELECT * FROM wallpaper_sources WHERE id = $1")
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
    .bind(
        req.fetch_batch_size
            .unwrap_or(existing.fetch_batch_size)
            .clamp(1, 50),
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
    // DATA-7: 删除来源会 CASCADE 掉其 remote_wallpapers,但 S3 blob 不会随之消失。
    // 删行前先采集该来源所有壁纸的 storage_key / thumbnail_key,删行后批量清理对象。
    let keys: Vec<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT storage_key, thumbnail_key FROM remote_wallpapers WHERE source_id = $1",
    )
    .bind(id)
    .fetch_all(&state.pg)
    .await
    .unwrap_or_default();

    sqlx::query("DELETE FROM wallpaper_sources WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;

    let objects = collect_wallpaper_keys(keys.iter().map(|(s, t)| (s.as_deref(), t.as_deref())));
    if !objects.is_empty() {
        if let Err(e) = state.storage.delete_objects(&objects).await {
            tracing::warn!("failed to delete S3 objects for wallpaper source {id}: {e}");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// DATA-7: 把 (storage_key, thumbnail_key) 序列里非空的 key 收成去重后的删除列表。
/// 纯逻辑,可单测。manual:// 等非 S3 来源不会进 storage_key,这里只处理真实对象 key。
pub fn collect_wallpaper_keys<'a, I>(rows: I) -> Vec<String>
where
    I: IntoIterator<Item = (Option<&'a str>, Option<&'a str>)>,
{
    let mut keys: Vec<String> = Vec::new();
    for (sk, tk) in rows {
        for k in [sk, tk].into_iter().flatten() {
            let k = k.trim();
            if !k.is_empty() {
                keys.push(k.to_string());
            }
        }
    }
    keys.sort();
    keys.dedup();
    keys
}

/// DATA-7: 删除单张壁纸对应的 S3 对象(视频/图片 + 缩略图)。尽力而为:失败仅告警。
pub(super) async fn delete_wallpaper_objects(
    storage: &Storage,
    storage_key: Option<&str>,
    thumb_key: Option<&str>,
) {
    let keys = collect_wallpaper_keys([(storage_key, thumb_key)]);
    if keys.is_empty() {
        return;
    }
    if let Err(e) = storage.delete_objects(&keys).await {
        tracing::warn!("failed to delete wallpaper S3 objects: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_storage_and_thumb_keys() {
        let rows = [
            (
                Some("wallpapers/remote/a.mp4"),
                Some("wallpapers/remote/thumbs/a.jpg"),
            ),
            (Some("wallpapers/remote/b.mp4"), None),
        ];
        let keys = collect_wallpaper_keys(rows);
        assert_eq!(
            keys,
            vec![
                "wallpapers/remote/a.mp4".to_string(),
                "wallpapers/remote/b.mp4".to_string(),
                "wallpapers/remote/thumbs/a.jpg".to_string(),
            ]
        );
    }

    #[test]
    fn skips_none_and_blank_keys() {
        let rows = [
            (None, None),
            (Some(""), Some("   ")),
            (Some("  wallpapers/remote/c.mp4  "), None),
        ];
        let keys = collect_wallpaper_keys(rows);
        assert_eq!(keys, vec!["wallpapers/remote/c.mp4".to_string()]);
    }

    #[test]
    fn dedups_repeated_keys() {
        let rows = [
            (Some("wallpapers/remote/x.mp4"), Some("shared.jpg")),
            (Some("wallpapers/remote/x.mp4"), Some("shared.jpg")),
        ];
        let keys = collect_wallpaper_keys(rows);
        assert_eq!(
            keys,
            vec![
                "shared.jpg".to_string(),
                "wallpapers/remote/x.mp4".to_string()
            ]
        );
    }

    #[test]
    fn empty_input_yields_empty() {
        let rows: [(Option<&str>, Option<&str>); 0] = [];
        assert!(collect_wallpaper_keys(rows).is_empty());
    }
}
