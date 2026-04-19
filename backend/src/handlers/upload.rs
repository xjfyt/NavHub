use crate::{
    error::{AppError, AppResult},
    handlers::util,
    models::SessionUser,
    state::AppState,
};
use axum::{
    extract::{Multipart, Path, State, Query},
    http::StatusCode,
    response::Redirect,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResp {
    pub url: String,
    pub filename: String,
    pub size: usize,
    pub sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    pub purpose: Option<String>,
}

pub async fn upload(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Query(query): Query<UploadQuery>,
    mut mp: Multipart,
) -> AppResult<(StatusCode, Json<UploadResp>)> {
    let max_bytes = (state.cfg.app.upload_max_mb * 1024 * 1024) as usize;
    if let Some(field) = mp
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let filename = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "blob".into());

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        if data.len() > max_bytes {
            return Err(AppError::BadRequest(format!(
                "file too large ({} bytes > {} max)",
                data.len(),
                max_bytes
            )));
        }
        
        let kind = infer::get(&data).ok_or_else(|| AppError::BadRequest("Unknown file type or invalid magic bytes".into()))?;
        let mime = kind.mime_type();
        if !mime.starts_with("image/") && !mime.starts_with("video/") {
            return Err(AppError::BadRequest("Only images and videos are allowed".into()));
        }
        
        if mime == "image/svg+xml" {
            let text = String::from_utf8_lossy(&data).to_lowercase();
            if text.contains("<script") || text.contains("javascript:") {
                return Err(AppError::BadRequest("SVG contains script tag".into()));
            }
        }
        
        let ct = mime.to_string();
        let ext = format!(".{}", kind.extension());

        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&data);
        let sha_hex = hex::encode(hasher.finalize());
        
        let purpose = query.purpose.as_deref().unwrap_or("icon");
        let prefix = match purpose {
            "wallpaper" => "wallpapers",
            "avatar" => "avatars",
            "icon" => "icons",
            _ => "uploads",
        };
        let name = format!("{}/{}{}", prefix, sha_hex, ext);
        let size = data.len();
        
        let url = if purpose == "icon" {
            let existing = sqlx::query_scalar::<_, String>(
                "SELECT url FROM library_icons WHERE sha256 = $1 LIMIT 1"
            )
            .bind(&sha_hex)
            .fetch_optional(&state.pg)
            .await
            .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;

            if let Some(existing_url) = existing {
                existing_url
            } else {
                state.storage.put_bytes(&name, Some(&ct), data.clone()).await?;
                let new_url = format!("/uploads/{name}");
                
                sqlx::query(
                    "INSERT INTO library_icons (sha256, name, url, uploader_id, size, content_type) VALUES ($1, $2, $3, $4, $5, $6)"
                )
                .bind(&sha_hex)
                .bind(&filename)
                .bind(&new_url)
                .bind(user.id)
                .bind(size as i32)
                .bind(&ct)
                .execute(&state.pg)
                .await
                .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
                
                new_url
            }
        } else {
            state.storage.put_bytes(&name, Some(&ct), data.clone()).await?;
            format!("/uploads/{}", name)
        };
        
        let local_name = name.clone();
        util::audit(
            &state,
            Some(&user),
            "upload",
            Some(filename.clone()),
            purpose,
            Some(serde_json::json!({ "size": size, "content_type": ct, "purpose": purpose })),
        )
        .await;
        return Ok((
            StatusCode::CREATED,
            Json(UploadResp {
                url,
                filename: local_name,
                size,
                sha256: Some(sha_hex),
            }),
        ));
    }
    Err(AppError::BadRequest("no file field".into()))
}

pub async fn serve(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> AppResult<Redirect> {
    let url = state.storage.presign_get_url(&path).await?;
    Ok(Redirect::temporary(&url))
}

