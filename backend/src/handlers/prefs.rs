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
    // 确保偏好行存在(custom_engines 默认为空数组)。
    let _ = ensure_prefs(&state, user.id).await?;
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
    let new_engine = json!({
        "id": id,
        "name": body.name,
        "url": body.url,
        "color": body.color.unwrap_or_else(|| "#3b82f6".into()),
        "label": letter,
    });
    // API-4: 原先「读取数组 → 内存追加 → 整体写回」存在并发丢更新竞态(两个并发
    // 添加请求会互相覆盖)。改为单条原子语句:在当前行值上用 jsonb `||` 追加,
    // 数据库内完成读改写,无竞态窗口。
    let v: Value = sqlx::query_scalar(
        "UPDATE user_preferences
            SET custom_engines = COALESCE(custom_engines, '[]'::jsonb) || jsonb_build_array($1::jsonb),
                updated_at = now()
          WHERE user_id = $2
          RETURNING custom_engines",
    )
    .bind(&new_engine)
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(v))
}

pub async fn delete_engine(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    // 确保偏好行存在。
    let _ = ensure_prefs(&state, user.id).await?;
    // API-4: 原先「读取数组 → 内存过滤 → 整体写回」存在并发丢更新竞态。改为单条原子
    // 语句:在数据库内用 jsonb_array_elements 重建剔除目标 id 后的数组,无竞态窗口。
    sqlx::query(
        "UPDATE user_preferences
            SET custom_engines = COALESCE(
                    (SELECT jsonb_agg(e)
                       FROM jsonb_array_elements(custom_engines) e
                      WHERE e->>'id' IS DISTINCT FROM $1),
                    '[]'::jsonb),
                updated_at = now()
          WHERE user_id = $2",
    )
    .bind(id.to_string())
    .bind(user.id)
    .execute(&state.pg)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
