use crate::{
    auth::require_at_least_admin,
    error::AppResult,
    models::{AuditEntry, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    Extension, Json,
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub kind: Option<String>,
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Query(q): Query<AuditQuery>,
) -> AppResult<Json<Vec<AuditEntry>>> {
    require_at_least_admin(user.role)?;
    let limit = q.limit.unwrap_or(200).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);
    let like = q.q.as_ref().map(|s| format!("%{s}%"));
    let rows: Vec<AuditEntry> = sqlx::query_as(
        "SELECT id, ts, actor_id, actor_name, action, target, kind, detail \
           FROM audit_log \
          WHERE ($1::text IS NULL OR kind = $1) \
            AND ($2::text IS NULL OR action ILIKE $2 OR target ILIKE $2 OR actor_name ILIKE $2) \
          ORDER BY ts DESC LIMIT $3 OFFSET $4",
    )
    .bind(q.kind.as_deref())
    .bind(like.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(rows))
}
