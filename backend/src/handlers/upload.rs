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
        
        let mut mime = "application/octet-stream".to_string();
        let mut ext = ".bin".to_string();

        if let Some(kind) = infer::get(&data) {
            mime = kind.mime_type().to_string();
            ext = format!(".{}", kind.extension());
        }

        // SVG fallback detection since infer might return text/xml or fail to detect
        if mime == "application/octet-stream" || mime == "text/xml" || mime == "application/xml" || mime == "text/plain" {
            let text = String::from_utf8_lossy(&data);
            if filename.to_lowercase().ends_with(".svg") && (text.trim().starts_with("<?xml") || text.trim().starts_with("<svg") || text.contains("<svg")) {
                mime = "image/svg+xml".to_string();
                ext = ".svg".to_string();
            }
        }

        if !mime.starts_with("image/") && !mime.starts_with("video/") {
            return Err(AppError::BadRequest("Only images and videos are allowed".into()));
        }
        
        if mime == "image/svg+xml" {
            if let Err(reason) = scan_svg_for_active_content(&data) {
                return Err(AppError::BadRequest(format!("SVG rejected: {reason}")));
            }
        }
        
        let ct = mime.to_string();

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

/// Reject SVGs that ship JavaScript or external resources we cannot sanitize.
/// Scope here is intentionally narrow: NavHub renders SVGs as `<img src>` (no script
/// execution context), but a presigned download could still be opened directly in a tab.
/// We block: <script>, on* event handlers, javascript:/data:text/html URIs in href/src,
/// <foreignObject>, <use href="…"> pointing off-document, and `<style>@import`.
fn scan_svg_for_active_content(bytes: &[u8]) -> Result<(), &'static str> {
    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return Err("not valid UTF-8"),
    };
    let lower = text.to_ascii_lowercase();

    if lower.contains("<script") || lower.contains("</script") {
        return Err("contains <script>");
    }
    if lower.contains("<foreignobject") {
        return Err("contains <foreignObject>");
    }
    if lower.contains("javascript:") || lower.contains("vbscript:") {
        return Err("contains script: URI");
    }
    // data:text/html is a known iframe/img bypass for some renderers.
    if lower.contains("data:text/html") || lower.contains("data:application/xhtml") {
        return Err("contains data:text/html");
    }
    if lower.contains("@import") {
        return Err("contains @import");
    }
    // Any inline event handler — be permissive about whitespace before '='
    // by scanning every byte position.
    if has_event_handler(&lower) {
        return Err("contains inline event handler");
    }
    Ok(())
}

fn has_event_handler(lower: &str) -> bool {
    // Look for ` on` or `\ton` or `\non` etc. followed by [a-z]+ then '=' (allowing ws)
    // i.e. attributes whose name starts with `on`. Cheap byte scan.
    let bytes = lower.as_bytes();
    for i in 0..bytes.len().saturating_sub(3) {
        let c = bytes[i];
        let is_attr_boundary = c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' || c == b'\x0c';
        if !is_attr_boundary {
            continue;
        }
        if bytes.get(i + 1).copied() != Some(b'o') || bytes.get(i + 2).copied() != Some(b'n') {
            continue;
        }
        // require [a-z] after `on`
        let mut j = i + 3;
        let mut saw_letter = false;
        while j < bytes.len() && bytes[j].is_ascii_lowercase() {
            saw_letter = true;
            j += 1;
        }
        if !saw_letter {
            continue;
        }
        // skip optional whitespace then expect '='
        while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'\t') {
            j += 1;
        }
        if bytes.get(j).copied() == Some(b'=') {
            return true;
        }
    }
    false
}

