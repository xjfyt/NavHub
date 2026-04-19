use crate::{
    error::{AppError, AppResult},
    handlers::workspace::ensure_prefs,
    models::{CustomEngineCreate, PreferencesView, PrefsPatch, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

pub async fn get_prefs(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<PreferencesView>> {
    let p = ensure_prefs(&state, user.id).await?;
    Ok(Json(p.into()))
}

pub async fn patch_prefs(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<PrefsPatch>,
) -> AppResult<Json<PreferencesView>> {
    // Ensure row exists
    let _ = ensure_prefs(&state, user.id).await?;
    let p: crate::models::UserPreferences = sqlx::query_as(
        "UPDATE user_preferences SET \
           tweaks = COALESCE($1, tweaks), \
           custom_engines = COALESCE($2, custom_engines), \
           pushed_group_wallpapers = COALESCE($3, pushed_group_wallpapers), \
           sidebar_order = COALESCE($4, sidebar_order), \
           updated_at = now() \
         WHERE user_id = $5 RETURNING *",
    )
    .bind(body.tweaks)
    .bind(body.custom_engines)
    .bind(body.pushed_group_wallpapers)
    .bind(body.sidebar_order)
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(p.into()))
}

pub async fn list_engines(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Value>> {
    let p = ensure_prefs(&state, user.id).await?;
    Ok(Json(p.custom_engines))
}

pub async fn add_engine(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<CustomEngineCreate>,
) -> AppResult<Json<Value>> {
    if !body.url.contains("{q}") {
        return Err(AppError::BadRequest(
            "url must contain {q} placeholder".into(),
        ));
    }
    let p = ensure_prefs(&state, user.id).await?;
    let mut arr = p.custom_engines.as_array().cloned().unwrap_or_default();
    let id = Uuid::new_v4();
    let letter = body
        .label
        .clone()
        .or_else(|| {
            body.name
                .chars()
                .next()
                .map(|c| c.to_uppercase().to_string())
        })
        .unwrap_or_else(|| "?".into());
    arr.push(json!({
        "id": id,
        "name": body.name,
        "url": body.url,
        "color": body.color.unwrap_or_else(|| "#3b82f6".into()),
        "label": letter,
    }));
    let v = Value::Array(arr);
    sqlx::query(
        "UPDATE user_preferences SET custom_engines = $1, updated_at = now() WHERE user_id = $2",
    )
    .bind(&v)
    .bind(user.id)
    .execute(&state.pg)
    .await?;
    Ok(Json(v))
}

pub async fn delete_engine(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let p = ensure_prefs(&state, user.id).await?;
    let arr: Vec<Value> = p
        .custom_engines
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|e| {
            e.get("id")
                .and_then(|v| v.as_str())
                .map(|s| s != id.to_string())
                .unwrap_or(true)
        })
        .collect();
    sqlx::query(
        "UPDATE user_preferences SET custom_engines = $1, updated_at = now() WHERE user_id = $2",
    )
    .bind(Value::Array(arr))
    .bind(user.id)
    .execute(&state.pg)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
