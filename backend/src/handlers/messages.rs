use crate::{
    error::{AppError, AppResult},
    models::{SessionUser, UserMessageRow},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use std::sync::Arc;
use uuid::Uuid;

pub async fn list(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Vec<UserMessageRow>>> {
    let rows: Vec<UserMessageRow> = sqlx::query_as(
        "SELECT m.id,
                m.title,
                m.content,
                m.level,
                m.target_type,
                m.target_role,
                m.target_user_id,
                m.link_url,
                COALESCE(cb.display_name, cb.username) AS created_by_name,
                m.created_at,
                mr.read_at,
                m.expires_at
           FROM system_messages m
           LEFT JOIN users cb ON cb.id = m.created_by
           LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = $1
          WHERE (m.target_type = 'all'
             OR (m.target_type = 'role' AND m.target_role = $2)
             OR (m.target_type = 'user' AND m.target_user_id = $1))
            AND (m.expires_at IS NULL OR m.expires_at > now())
          ORDER BY m.created_at DESC
          LIMIT 200",
    )
    .bind(user.id)
    .bind(user.role.as_str())
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}

pub async fn mark_read(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    ensure_message_visible(&state, user.id, user.role.as_str(), id).await?;
    sqlx::query(
        "INSERT INTO message_reads (message_id, user_id, read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at",
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.pg)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_read(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<StatusCode> {
    sqlx::query(
        "INSERT INTO message_reads (message_id, user_id, read_at)
         SELECT m.id, $1, now()
           FROM system_messages m
          WHERE (m.target_type = 'all'
             OR (m.target_type = 'role' AND m.target_role = $2)
             OR (m.target_type = 'user' AND m.target_user_id = $1))
            AND (m.expires_at IS NULL OR m.expires_at > now())
          ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at",
    )
    .bind(user.id)
    .bind(user.role.as_str())
    .execute(&state.pg)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn ensure_message_visible(
    state: &Arc<AppState>,
    user_id: Uuid,
    role: &str,
    id: Uuid,
) -> AppResult<()> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id
           FROM system_messages m
          WHERE m.id = $1
            AND (
                m.target_type = 'all'
                OR (m.target_type = 'role' AND m.target_role = $2)
                OR (m.target_type = 'user' AND m.target_user_id = $3)
            )
            AND (m.expires_at IS NULL OR m.expires_at > now())",
    )
    .bind(id)
    .bind(role)
    .bind(user_id)
    .fetch_optional(&state.pg)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }
    Ok(())
}
