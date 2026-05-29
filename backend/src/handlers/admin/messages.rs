use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    handlers::util,
    models::{AdminMessageRow, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde::Deserialize;
use std::sync::Arc;
use url::Url;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessage {
    pub title: String,
    pub content: String,
    pub level: String,
    pub target_type: String,
    pub target_role: Option<String>,
    pub target_user_id: Option<Uuid>,
    pub link_url: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Vec<AdminMessageRow>>> {
    require_at_least_admin(user.role)?;
    let rows: Vec<AdminMessageRow> = sqlx::query_as(
        "SELECT m.id,
                m.title,
                m.content,
                m.level,
                m.target_type,
                m.target_role,
                m.target_user_id,
                COALESCE(tu.display_name, tu.username) AS target_user_name,
                m.link_url,
                m.created_by,
                COALESCE(cb.display_name, cb.username) AS created_by_name,
                m.created_at,
                m.expires_at
           FROM system_messages m
           LEFT JOIN users tu ON tu.id = m.target_user_id
           LEFT JOIN users cb ON cb.id = m.created_by
          ORDER BY m.created_at DESC
          LIMIT 300",
    )
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<CreateMessage>,
) -> AppResult<(StatusCode, Json<AdminMessageRow>)> {
    require_at_least_admin(user.role)?;

    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    let content = body.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest("content is required".into()));
    }

    let level = normalize_level(&body.level)?;
    let (target_type, target_role, target_user_id) = validate_target(&state, &body).await?;
    let link_url = normalize_link(body.link_url.as_deref())?;

    let row: AdminMessageRow = sqlx::query_as(
        "INSERT INTO system_messages (
            title, content, level, target_type, target_role, target_user_id, link_url, created_by, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id,
                   title,
                   content,
                   level,
                   target_type,
                   target_role,
                   target_user_id,
                   NULL::text AS target_user_name,
                   link_url,
                   created_by,
                   NULL::text AS created_by_name,
                   created_at,
                   expires_at",
    )
    .bind(title)
    .bind(content)
    .bind(&level)
    .bind(&target_type)
    .bind(target_role.as_deref())
    .bind(target_user_id)
    .bind(link_url.as_deref())
    .bind(user.id)
    .bind(body.expires_at)
    .fetch_one(&state.pg)
    .await?;

    let created = fetch_message_row(&state, row.id).await?;
    util::audit(
        &state,
        Some(&user),
        "admin_create_message",
        Some(title.to_string()),
        "message",
        Some(serde_json::json!({
            "level": level,
            "targetType": target_type,
            "targetRole": target_role,
            "targetUserId": target_user_id,
        })),
    )
    .await;

    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    let existing = fetch_message_row(&state, id).await?;
    let deleted = sqlx::query("DELETE FROM system_messages WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    util::audit(
        &state,
        Some(&user),
        "admin_delete_message",
        Some(existing.title),
        "message",
        Some(serde_json::json!({
            "targetType": existing.target_type,
            "targetRole": existing.target_role,
            "targetUserId": existing.target_user_id,
        })),
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

async fn fetch_message_row(state: &Arc<AppState>, id: Uuid) -> AppResult<AdminMessageRow> {
    sqlx::query_as(
        "SELECT m.id,
                m.title,
                m.content,
                m.level,
                m.target_type,
                m.target_role,
                m.target_user_id,
                COALESCE(tu.display_name, tu.username) AS target_user_name,
                m.link_url,
                m.created_by,
                COALESCE(cb.display_name, cb.username) AS created_by_name,
                m.created_at,
                m.expires_at
           FROM system_messages m
           LEFT JOIN users tu ON tu.id = m.target_user_id
           LEFT JOIN users cb ON cb.id = m.created_by
          WHERE m.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)
}

fn normalize_level(level: &str) -> AppResult<String> {
    match level.trim() {
        "info" | "success" | "warning" | "error" => Ok(level.trim().to_string()),
        _ => Err(AppError::BadRequest("invalid level".into())),
    }
}

async fn validate_target(
    state: &Arc<AppState>,
    body: &CreateMessage,
) -> AppResult<(String, Option<String>, Option<Uuid>)> {
    // API-1: 复用 util 中的纯校验逻辑,确保 target_type 与 role/user 字段一致;
    // 用户存在性需触库,留在此处补做。
    let (target_type, target_role, target_user_id) = util::validate_push_target(
        &body.target_type,
        body.target_role.as_deref(),
        body.target_user_id,
    )?;
    if let Some(uid) = target_user_id {
        let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(&state.pg)
            .await?;
        if exists.is_none() {
            return Err(AppError::BadRequest("target user not found".into()));
        }
    }
    Ok((target_type, target_role, target_user_id))
}

fn normalize_link(link: Option<&str>) -> AppResult<Option<String>> {
    let Some(link) = link.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let parsed = Url::parse(link).map_err(|_| AppError::BadRequest("invalid link url".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::BadRequest("link url must be http(s)".into()));
    }
    Ok(Some(parsed.to_string()))
}
