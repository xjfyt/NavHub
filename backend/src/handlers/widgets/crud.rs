use crate::{
    error::{AppError, AppResult},
    handlers::util,
    models::{Group, SessionUser, Widget, WidgetCreate, WidgetUpdate, WidgetView},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use std::sync::Arc;
use uuid::Uuid;

async fn load_group(state: &Arc<AppState>, id: Uuid) -> AppResult<Group> {
    sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn create(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<WidgetCreate>,
) -> AppResult<(StatusCode, Json<WidgetView>)> {
    let g = load_group(&state, body.group_id).await?;
    if !util::group_writable_by(&g, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    let w: Widget = sqlx::query_as(
        "INSERT INTO widgets (group_id, widget_type, w_span, w_row, config, sort_order) \
         VALUES ($1,$2,$3,$4,$5, COALESCE((SELECT MAX(sort_order)+1 FROM widgets WHERE group_id=$1),0)) RETURNING *",
    )
    .bind(body.group_id)
    .bind(&body.widget)
    .bind(body.w_span)
    .bind(body.w_row)
    .bind(&body.config)
    .fetch_one(&state.pg)
    .await?;
    util::audit(
        &state,
        Some(&user),
        "create_widget",
        Some(w.widget_type.clone()),
        "widget",
        None,
    )
    .await;
    Ok((StatusCode::CREATED, Json(into_view(w, false))))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<WidgetUpdate>,
) -> AppResult<Json<WidgetView>> {
    let existing: Widget = sqlx::query_as("SELECT * FROM widgets WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, existing.group_id).await?;
    if !util::group_writable_by(&g, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    if let Some(new_gid) = body.group_id {
        if new_gid != existing.group_id {
            let g2 = load_group(&state, new_gid).await?;
            if !util::group_writable_by(&g2, &user) {
                return Err(AppError::Forbidden("target_not_writable"));
            }
        }
    }
    let w: Widget = sqlx::query_as(
        "UPDATE widgets SET \
           group_id = COALESCE($1, group_id), \
           w_span = COALESCE($2, w_span), \
           w_row = COALESCE($3, w_row), \
           config = COALESCE($4, config), \
           sort_order = COALESCE($5, sort_order), \
           updated_at = now() \
         WHERE id = $6 RETURNING *",
    )
    .bind(body.group_id)
    .bind(body.w_span)
    .bind(body.w_row)
    .bind(body.config.as_ref())
    .bind(body.sort_order)
    .bind(id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(into_view(w, false)))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing: Widget = sqlx::query_as("SELECT * FROM widgets WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, existing.group_id).await?;
    if !util::group_writable_by(&g, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    sqlx::query("DELETE FROM widgets WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn into_view(w: Widget, read_only: bool) -> WidgetView {
    WidgetView {
        id: w.id,
        group_id: w.group_id,
        widget: w.widget_type,
        w_span: w.w_span,
        w_row: w.w_row,
        config: w.config,
        sort_order: w.sort_order,
        grid_x: w.grid_x,
        grid_y: w.grid_y,
        read_only,
    }
}
