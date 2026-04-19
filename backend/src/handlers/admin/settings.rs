use crate::{
    auth::require_at_least_admin, error::AppResult, handlers::util, models::SessionUser,
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use serde_json::{Map, Value};
use std::sync::Arc;

pub async fn get(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Value>> {
    require_at_least_admin(user.role)?;
    let rows: Vec<(String, Value)> =
        sqlx::query_as("SELECT key, value FROM app_settings WHERE key != 'sso'")
            .fetch_all(&state.pg)
            .await?;
    let mut map = Map::new();
    for (k, v) in rows {
        map.insert(k, v);
    }
    Ok(Json(Value::Object(map)))
}

pub async fn patch(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<Value>,
) -> AppResult<Json<Value>> {
    require_at_least_admin(user.role)?;
    let obj = body.as_object().cloned().unwrap_or_default();
    let mut tx = state.pg.begin().await?;
    for (k, v) in &obj {
        if k == "sso" {
            continue; // SSO managed via /admin/sso
        }
        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now()) \
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()",
        )
        .bind(k)
        .bind(v)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    util::audit(
        &state,
        Some(&user),
        "update_settings",
        None,
        "settings",
        Some(Value::Object(obj.clone())),
    )
    .await;
    Ok(Json(Value::Object(obj)))
}
