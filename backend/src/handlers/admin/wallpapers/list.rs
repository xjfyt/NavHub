use super::sources::delete_wallpaper_objects;
use super::types::{AdminWallpaperListResponse, ListWallpapersQuery, UpdateWallpaperReq};
use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{wallpaper::RemoteWallpaper, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension, Json,
};
use std::sync::Arc;
use uuid::Uuid;

pub async fn list_wallpapers(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Query(q): Query<ListWallpapersQuery>,
) -> AppResult<Json<AdminWallpaperListResponse>> {
    require_at_least_admin(user.role)?;
    // API-5: 收紧分页参数,避免 limit=0/超大或负 offset。
    let (limit, offset) =
        crate::handlers::util::clamp_page(q.limit.unwrap_or(50), q.offset.unwrap_or(0));

    let (items, total) = if let Some(sid) = q.source_id {
        let total: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM remote_wallpapers WHERE source_id = $1")
                .bind(sid)
                .fetch_one(&state.pg)
                .await?;
        let rows = sqlx::query_as::<_, RemoteWallpaper>(
            "SELECT * FROM remote_wallpapers WHERE source_id = $1 ORDER BY fetched_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(sid)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pg)
        .await?;
        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_wallpapers")
            .fetch_one(&state.pg)
            .await?;
        let rows = sqlx::query_as::<_, RemoteWallpaper>(
            "SELECT * FROM remote_wallpapers ORDER BY fetched_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pg)
        .await?;
        (rows, total)
    };
    Ok(Json(AdminWallpaperListResponse { items, total }))
}

pub async fn update_wallpaper(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateWallpaperReq>,
) -> AppResult<Json<RemoteWallpaper>> {
    require_at_least_admin(user.role)?;
    let title = req
        .title
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let row = sqlx::query_as::<_, RemoteWallpaper>(
        "UPDATE remote_wallpapers SET title = COALESCE($2, title) WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(title)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

pub async fn delete_wallpaper(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    // API-3: 删除壁纸后,被影响来源的 total_fetched 必须随之回算,否则计数只增不减。
    // 用 RETURNING source_id 拿到归属来源,再按 COUNT 重算(最稳妥,避免计数漂移)。
    // DATA-7: 同时 RETURNING storage_key / thumbnail_key,删行后清理对应 S3 blob,
    // 否则视频/缩略图对象会永远滞留在桶里。
    let deleted: Option<(Option<Uuid>, Option<String>, Option<String>)> = sqlx::query_as(
        "DELETE FROM remote_wallpapers WHERE id = $1 RETURNING source_id, storage_key, thumbnail_key",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?;
    let source_id = deleted.as_ref().and_then(|(sid, _, _)| *sid);
    if let Some((_, sk, tk)) = &deleted {
        delete_wallpaper_objects(&state.storage, sk.as_deref(), tk.as_deref()).await;
    }
    if let Some(sid) = source_id {
        sqlx::query(
            "UPDATE wallpaper_sources
                SET total_fetched = (SELECT COUNT(*)::int FROM remote_wallpapers WHERE source_id = $1),
                    updated_at = now()
              WHERE id = $1",
        )
        .bind(sid)
        .execute(&state.pg)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}
