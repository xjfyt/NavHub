use crate::{
    error::{AppError, AppResult},
    models::SessionUser,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IconLibrary {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIcon {
    pub id: Uuid,
    pub library_id: Option<Uuid>,
    pub sha256: String,
    pub name: String,
    pub url: String,
    pub uploader_id: Option<Uuid>,
    pub uploader_name: Option<String>,
    pub size: i32,
    pub content_type: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryReq {
    pub name: String,
    pub description: Option<String>,
}

pub async fn list_libraries(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<SessionUser>,
) -> AppResult<Json<Vec<IconLibrary>>> {
    // (Admin check removed: accessible to all logged-in users)

    let libs = sqlx::query_as::<_, IconLibrary>(
        "SELECT id, name, description, created_at, updated_at FROM icon_libraries ORDER BY created_at DESC"
    )
    .fetch_all(&state.pg)
    .await
    .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;

    Ok(Json(libs))
}

pub async fn create_library(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(req): Json<CreateLibraryReq>,
) -> AppResult<Json<IconLibrary>> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }
    
    if req.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }

    let lib = sqlx::query_as::<_, IconLibrary>(
        "INSERT INTO icon_libraries (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at, updated_at"
    )
    .bind(req.name.trim())
    .bind(req.description.map(|s| s.trim().to_string()))
    .fetch_one(&state.pg)
    .await
    .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;

    Ok(Json(lib))
}

pub async fn delete_library(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }

    sqlx::query("DELETE FROM icon_libraries WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIconsQuery {
    pub library_id: Option<Uuid>,
    pub user_uploads_only: Option<bool>,
}

pub async fn list_icons(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<SessionUser>,
    axum::extract::Query(query): axum::extract::Query<ListIconsQuery>,
) -> AppResult<Json<Vec<LibraryIcon>>> {
    // (Admin check removed: accessible to all logged-in users)

    let icons = if let Some(lib_id) = query.library_id {
        sqlx::query_as::<_, LibraryIcon>(
            r#"
            SELECT li.id, li.library_id, li.sha256, li.name, li.url, li.uploader_id, li.size, li.content_type, li.created_at, li.updated_at,
                   u.display_name as uploader_name
            FROM library_icons li
            LEFT JOIN users u ON u.id = li.uploader_id
            WHERE li.library_id = $1
            ORDER BY li.created_at DESC
            "#
        )
        .bind(lib_id)
        .fetch_all(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?
    } else if query.user_uploads_only.unwrap_or(false) {
        sqlx::query_as::<_, LibraryIcon>(
            r#"
            SELECT li.id, li.library_id, li.sha256, li.name, li.url, li.uploader_id, li.size, li.content_type, li.created_at, li.updated_at,
                   u.display_name as uploader_name
            FROM library_icons li
            LEFT JOIN users u ON u.id = li.uploader_id
            WHERE li.library_id IS NULL
            ORDER BY li.created_at DESC
            "#
        )
        .fetch_all(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?
    } else {
        sqlx::query_as::<_, LibraryIcon>(
            r#"
            SELECT li.id, li.library_id, li.sha256, li.name, li.url, li.uploader_id, li.size, li.content_type, li.created_at, li.updated_at,
                   u.display_name as uploader_name
            FROM library_icons li
            LEFT JOIN users u ON u.id = li.uploader_id
            ORDER BY li.created_at DESC
            "#
        )
        .fetch_all(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?
    };

    Ok(Json(icons))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddIconReq {
    pub sha256: String,
    pub name: String,
    pub url: String,
    pub size: i32,
    pub content_type: String,
}

pub async fn add_icons_to_library(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(library_id): Path<Uuid>,
    Json(reqs): Json<Vec<AddIconReq>>,
) -> AppResult<StatusCode> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }

    for req in reqs {
        sqlx::query(
            "INSERT INTO library_icons (library_id, sha256, name, url, uploader_id, size, content_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (library_id, sha256) DO UPDATE SET updated_at = now()"
        )
        .bind(library_id)
        .bind(req.sha256)
        .bind(req.name)
        .bind(req.url)
        .bind(user.id)
        .bind(req.size)
        .bind(req.content_type)
        .execute(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    }

    Ok(StatusCode::OK)
}

pub async fn delete_icon(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }
    
    // We only delete the DB record. The S3 object might be shared so we don't delete it physically.
    sqlx::query("DELETE FROM library_icons WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LibraryExport {
    pub library: IconLibrary,
    pub icons: Vec<LibraryIcon>,
}

pub async fn export_library(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<LibraryExport>> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }

    let lib = sqlx::query_as::<_, IconLibrary>(
        "SELECT id, name, description, created_at, updated_at FROM icon_libraries WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await
    .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::NotFound)?;
    
    let icons = sqlx::query_as::<_, LibraryIcon>(
        r#"
        SELECT li.id, li.library_id, li.sha256, li.name, li.url, li.uploader_id, li.size, li.content_type, li.created_at, li.updated_at,
               u.display_name as uploader_name
        FROM library_icons li
        LEFT JOIN users u ON u.id = li.uploader_id
        WHERE li.library_id = $1
        ORDER BY li.created_at ASC
        "#
    )
    .bind(id)
    .fetch_all(&state.pg)
    .await
    .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    
    Ok(Json(LibraryExport { library: lib, icons }))
}

pub async fn import_library(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(export): Json<LibraryExport>,
) -> AppResult<StatusCode> {
    if !user.role.at_least_admin() {
        return Err(AppError::Forbidden("admin only"));
    }
    
    let mut tx = state.pg.begin().await.map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    
    let lib_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO icon_libraries (name, description) VALUES ($1, $2) RETURNING id"
    )
    .bind(&export.library.name)
    .bind(&export.library.description)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    
    for icon in export.icons {
        sqlx::query(
            "INSERT INTO library_icons (library_id, sha256, name, url, uploader_id, size, content_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (library_id, sha256) DO NOTHING"
        )
        .bind(lib_id)
        .bind(icon.sha256)
        .bind(icon.name)
        .bind(icon.url)
        .bind(user.id)
        .bind(icon.size)
        .bind(icon.content_type)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    }
    
    tx.commit().await.map_err(|e: sqlx::Error| AppError::Internal(e.to_string()))?;
    
    Ok(StatusCode::CREATED)
}
