use super::fetch::measure_image_dimensions;
use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    models::{wallpaper::RemoteWallpaper, wallpaper::WallpaperSource, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Multipart, Path, State},
    Extension, Json,
};
use bytes::Bytes;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

/// Manual-upload endpoint for sources with scraper_type="manual".
/// Receives a single multipart file, stores it in MinIO, and inserts a remote_wallpapers row.
/// Dedupe by sha256: re-uploading the same bytes is idempotent (returns the existing row).
pub async fn upload_wallpaper(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    mut mp: Multipart,
) -> AppResult<Json<RemoteWallpaper>> {
    require_at_least_admin(user.role)?;

    let source =
        sqlx::query_as::<_, WallpaperSource>("SELECT * FROM wallpaper_sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pg)
            .await?
            .ok_or(AppError::NotFound)?;

    if source.scraper_type != "manual" {
        return Err(AppError::BadRequest(
            "upload only available for manual sources".into(),
        ));
    }

    let field = mp
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .ok_or_else(|| AppError::BadRequest("no file in multipart payload".into()))?;

    let filename = field
        .file_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "wallpaper".into());

    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let max_bytes: usize = 200 * 1024 * 1024;
    if data.len() > max_bytes {
        return Err(AppError::BadRequest(format!(
            "file too large ({} bytes > {} max)",
            data.len(),
            max_bytes
        )));
    }

    let (mime, ext) = match infer::get(&data) {
        Some(kind) => (kind.mime_type().to_string(), kind.extension().to_string()),
        None => {
            return Err(AppError::BadRequest("unable to detect file type".into()));
        }
    };

    let media_type = if mime.starts_with("image/") {
        "image"
    } else if mime.starts_with("video/") {
        "video"
    } else {
        return Err(AppError::BadRequest(
            "only images and videos are allowed".into(),
        ));
    };

    let file_size = data.len() as i64;

    // INFRA-2: 手动上传可达 200MB,SHA-256 哈希与 imagesize 测量都是 CPU 密集型,
    // 放到 spawn_blocking 避免阻塞运行时。data 是 Bytes(Arc 背书),clone 不复制底层。
    let data_for_cpu = data.clone();
    let (sha_hex, width, height) = tokio::task::spawn_blocking(move || {
        let mut hasher = Sha256::new();
        hasher.update(&data_for_cpu);
        let sha_hex = hex::encode(hasher.finalize());
        let (width, height) = measure_image_dimensions(&data_for_cpu);
        (sha_hex, width, height)
    })
    .await
    .map_err(|e| AppError::Internal(format!("hash/measure task failed: {e}")))?;

    let storage_key = format!("wallpapers/manual/{sha_hex}.{ext}");
    let original_url = format!("manual://{sha_hex}");

    let bytes_data: Bytes = data.to_vec().into();
    state
        .storage
        .put_bytes(&storage_key, Some(&mime), bytes_data)
        .await?;

    let title = std::path::Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "未命名壁纸".to_string());

    let row = sqlx::query_as::<_, RemoteWallpaper>(
        "INSERT INTO remote_wallpapers
            (source_id, title, original_url, storage_key, media_type, file_size_bytes, width, height, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
         ON CONFLICT (source_id, original_url) DO UPDATE
            SET storage_key = EXCLUDED.storage_key,
                media_type = EXCLUDED.media_type,
                file_size_bytes = EXCLUDED.file_size_bytes,
                width = EXCLUDED.width,
                height = EXCLUDED.height
         RETURNING *",
    )
    .bind(id)
    .bind(&title)
    .bind(&original_url)
    .bind(&storage_key)
    .bind(media_type)
    .bind(file_size)
    .bind(width)
    .bind(height)
    .fetch_one(&state.pg)
    .await?;

    sqlx::query("UPDATE wallpaper_sources SET updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;

    Ok(Json(row))
}
