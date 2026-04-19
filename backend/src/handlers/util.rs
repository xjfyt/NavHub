use crate::{models::SessionUser, state::AppState};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

pub async fn audit(
    state: &Arc<AppState>,
    actor: Option<&SessionUser>,
    action: &str,
    target: Option<String>,
    kind: &str,
    detail: Option<Value>,
) {
    let (id, name): (Option<Uuid>, Option<String>) = match actor {
        Some(u) => (Some(u.id), Some(u.username.clone())),
        None => (None, None),
    };
    let res = sqlx::query(
        "INSERT INTO audit_log (actor_id, actor_name, action, target, kind, detail) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(name)
    .bind(action)
    .bind(target)
    .bind(kind)
    .bind(detail)
    .execute(&state.pg)
    .await;
    if let Err(e) = res {
        tracing::warn!("audit insert failed: {e}");
    }
}

pub fn group_writable_by(owner_id: Option<Uuid>, pushed: bool, push_allow_edit: bool, user: &SessionUser) -> bool {
    if user.role.at_least_admin() {
        return true;
    }
    if pushed {
        return push_allow_edit;
    }
    owner_id == Some(user.id)
}
