use crate::{
    auth::require_at_least_admin,
    error::AppResult,
    models::{AuditEntry, SessionUser},
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use serde::Serialize;
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_users: i64,
    pub online_users: i64,
    pub total_icons: i64,
    pub total_groups: i64,
    pub recent_audit: Vec<AuditEntry>,
    pub roles_distribution: std::collections::HashMap<String, i64>,
}

pub async fn get_dashboard(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<DashboardStats>> {
    require_at_least_admin(user.role)?;

    let pool = state.pg.clone();

    let query_counts = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT 
            (SELECT COUNT(*) FROM users), 
            (SELECT COUNT(*) FROM icons), 
            (SELECT COUNT(*) FROM groups)"
    )
    .fetch_one(&pool);

    let query_online = sqlx::query(
        "SELECT COUNT(*) FROM users WHERE last_seen_at > NOW() - INTERVAL '15 minutes'",
    )
    .fetch_one(&pool);

    let query_roles = sqlx::query("SELECT role, COUNT(*) as count FROM users GROUP BY role")
        .fetch_all(&pool);

    let query_audit = sqlx::query_as::<_, AuditEntry>(
        "SELECT id, ts, actor_id, actor_name, action, target, kind, detail \
         FROM audit_log ORDER BY ts DESC LIMIT 5",
    )
    .fetch_all(&pool);

    let (
        (total_users, total_icons, total_groups),
        online_row,
        roles_rows,
        recent_audit,
    ) = tokio::try_join!(query_counts, query_online, query_roles, query_audit)?;

    let online_users: i64 = online_row.get(0);

    let mut roles_distribution = std::collections::HashMap::new();
    for row in roles_rows {
        let role: String = row.get("role");
        let count: i64 = row.get("count");
        roles_distribution.insert(role, count);
    }

    Ok(Json(DashboardStats {
        total_users,
        online_users,
        total_icons,
        total_groups,
        recent_audit,
        roles_distribution,
    }))
}
