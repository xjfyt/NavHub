use crate::{
    error::{AppError, AppResult},
    handlers::util,
    models::{Group, GroupView, GroupCreate, GroupUpdate, ReorderRequest, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use std::collections::HashSet;
use std::sync::Arc;
use uuid::Uuid;

pub async fn create(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<GroupCreate>,
) -> AppResult<(StatusCode, Json<GroupView>)> {
    if matches!(user.role, crate::models::Role::Guest) {
        return Err(AppError::Forbidden("read_only"));
    }
    // Owner defaults to current user; admin can create public by passing owner=null (future extension)
    let g: Group = sqlx::query_as(
        "INSERT INTO groups (name, icon, owner_id, pushed, sort_order) \
         VALUES ($1, $2, $3, FALSE, \
           COALESCE((SELECT MAX(sort_order)+1 FROM groups WHERE owner_id = $3), 100)) \
         RETURNING *",
    )
    .bind(&body.name)
    .bind(&body.icon)
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    util::audit(
        &state,
        Some(&user),
        "create_group",
        Some(g.name.clone()),
        "group",
        None,
    )
    .await;
    let gv = GroupView {
        read_only: false,
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner_id: g.owner_id,
        owner_name: Some(user.username.clone()),
        pushed: g.pushed,
        push_target_type: g.push_target_type,
        push_target_role: g.push_target_role,
        push_target_user_id: g.push_target_user_id,
        push_allow_edit: g.push_allow_edit,
        sort_order: g.sort_order,
    };
    Ok((StatusCode::CREATED, Json(gv)))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<GroupUpdate>,
) -> AppResult<Json<GroupView>> {
    let existing: Group = sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    if !util::group_writable_by(existing.owner_id, existing.pushed, existing.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    let g: Group = sqlx::query_as(
        "UPDATE groups SET name = COALESCE($1, name), icon = COALESCE($2, icon), updated_at = now() \
         WHERE id = $3 RETURNING *",
    )
    .bind(body.name.as_deref())
    .bind(body.icon.as_deref())
    .bind(id)
    .fetch_one(&state.pg)
    .await?;
    util::audit(
        &state,
        Some(&user),
        "update_group",
        Some(g.name.clone()),
        "group",
        None,
    )
    .await;
    let owner_name: Option<String> = if let Some(oid) = g.owner_id {
        sqlx::query_scalar("SELECT COALESCE(display_name, username) FROM users WHERE id = $1")
            .bind(oid)
            .fetch_optional(&state.pg)
            .await
            .unwrap_or(None)
    } else {
        None
    };
    let gv = GroupView {
        read_only: false,
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner_id: g.owner_id,
        owner_name,
        pushed: g.pushed,
        push_target_type: g.push_target_type,
        push_target_role: g.push_target_role,
        push_target_user_id: g.push_target_user_id,
        push_allow_edit: g.push_allow_edit,
        sort_order: g.sort_order,
    };
    Ok(Json(gv))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing: Group = sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    if !util::group_writable_by(existing.owner_id, existing.pushed, existing.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    util::audit(
        &state,
        Some(&user),
        "delete_group",
        Some(existing.name),
        "group",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<ReorderRequest>,
) -> AppResult<StatusCode> {
    if user.role.at_least_admin() {
        // Admin reorders the global sort_order
        let mut tx = state.pg.begin().await?;
        for (i, gid) in body.order.iter().enumerate() {
            sqlx::query("UPDATE groups SET sort_order = $1 WHERE id = $2")
                .bind(i as i32)
                .bind(gid)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    } else {
        // Normal user: persist per-user sidebar order
        sqlx::query(
            "INSERT INTO user_preferences (user_id, sidebar_order, updated_at) \
             VALUES ($1, $2, now()) \
             ON CONFLICT (user_id) DO UPDATE SET sidebar_order = $2, updated_at = now()",
        )
        .bind(user.id)
        .bind(&body.order)
        .execute(&state.pg)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder_items(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<crate::models::GroupItemsReorderRequest>,
) -> AppResult<StatusCode> {
    let existing: Group = sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    if !util::group_writable_by(existing.owner_id, existing.pushed, existing.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    if body.order.is_empty() {
        return Err(AppError::BadRequest("order is empty".into()));
    }
    let expected_icons: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM icons WHERE group_id = $1")
        .bind(id)
        .fetch_one(&state.pg)
        .await?;
    let expected_widgets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM widgets WHERE group_id = $1")
        .bind(id)
        .fetch_one(&state.pg)
        .await?;
    let expected_total = (expected_icons + expected_widgets) as usize;
    if body.order.len() != expected_total {
        return Err(AppError::BadRequest(format!(
            "invalid reorder payload size: expected {expected_total} items, got {}",
            body.order.len()
        )));
    }
    let mut uniq = HashSet::with_capacity(body.order.len());
    for item in &body.order {
        if !uniq.insert((item.id, item.r#type.clone())) {
            return Err(AppError::BadRequest("duplicate reorder entries".into()));
        }
    }

    let mut tx = state.pg.begin().await?;
    let mut updated_rows: u64 = 0;
    for (i, item) in body.order.iter().enumerate() {
        if item.r#type == "icon" {
            let res = sqlx::query("UPDATE icons SET sort_order = $1, grid_x = $2, grid_y = $3 WHERE id = $4 AND group_id = $5")
                .bind(i as i32)
                .bind(item.x)
                .bind(item.y)
                .bind(item.id)
                .bind(id)
                .execute(&mut *tx)
                .await?;
            updated_rows += res.rows_affected();
        } else if item.r#type == "widget" {
            let res = sqlx::query("UPDATE widgets SET sort_order = $1, grid_x = $2, grid_y = $3 WHERE id = $4 AND group_id = $5")
                .bind(i as i32)
                .bind(item.x)
                .bind(item.y)
                .bind(item.id)
                .bind(id)
                .execute(&mut *tx)
                .await?;
            updated_rows += res.rows_affected();
        } else {
            tx.rollback().await?;
            return Err(AppError::BadRequest(format!("unknown item type: {}", item.r#type)));
        }
    }
    let expected = body.order.len() as u64;
    if updated_rows != expected {
        tx.rollback().await?;
        return Err(AppError::BadRequest(format!(
            "invalid reorder payload: expected {expected} items, updated {updated_rows}"
        )));
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
