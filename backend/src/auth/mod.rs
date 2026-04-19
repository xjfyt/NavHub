pub mod casdoor;
pub mod middleware;
pub mod password;
pub mod session;
pub mod sso_cache;

use crate::{
    config::SuperadminConfig,
    error::{AppError, AppResult},
    models::Role,
    state::AppState,
};
use std::sync::Arc;
use uuid::Uuid;

pub async fn bootstrap_superadmin(state: &Arc<AppState>) -> anyhow::Result<()> {
    let existing: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1")
            .fetch_optional(&state.pg)
            .await?;
    if existing.is_some() {
        return Ok(());
    }
    let cfg: &SuperadminConfig = &state.cfg.superadmin;
    let hash = password::hash_password(&cfg.password)?;
    sqlx::query(
        r#"
        INSERT INTO users (id, username, email, display_name, role, password_hash, must_change_password)
        VALUES (gen_random_uuid(), $1, $2, $3, 'superadmin', $4, true)
        ON CONFLICT (username) DO NOTHING
        "#,
    )
    .bind(&cfg.username)
    .bind(&cfg.email)
    .bind(&cfg.display_name)
    .bind(&hash)
    .execute(&state.pg)
    .await?;
    tracing::info!(
        "superadmin bootstrapped: username={} email={}",
        cfg.username,
        cfg.email
    );
    Ok(())
}

// shorthand for handlers
pub fn require_at_least_admin(role: Role) -> AppResult<()> {
    if role.at_least_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden("admin_required"))
    }
}

pub fn require_superadmin(role: Role) -> AppResult<()> {
    if matches!(role, Role::Superadmin) {
        Ok(())
    } else {
        Err(AppError::Forbidden("superadmin_required"))
    }
}
