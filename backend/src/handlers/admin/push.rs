use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    handlers::util,
    models::{Group, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension,
};
use std::sync::Arc;
use uuid::Uuid;

use axum::Json;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub target_type: String,
    pub target_role: Option<String>,
    pub target_user_id: Option<Uuid>,
    pub push_allow_edit: Option<bool>,
}

pub async fn push(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(payload): Json<PushRequest>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    let g: Group = sqlx::query_as(
        "UPDATE groups SET pushed = TRUE, push_target_type = $2, push_target_role = $3, push_target_user_id = $4, push_allow_edit = $5, updated_at = now() \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(payload.target_type)
    .bind(payload.target_role)
    .bind(payload.target_user_id)
    .bind(payload.push_allow_edit.unwrap_or(false))
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    util::audit(
        &state,
        Some(&user),
        "push_group",
        Some(g.name),
        "group",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unpush(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    let g: Group = sqlx::query_as(
        "UPDATE groups SET pushed = FALSE, push_target_type = 'all', push_target_role = NULL, push_target_user_id = NULL, push_allow_edit = FALSE, updated_at = now() \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    util::audit(
        &state,
        Some(&user),
        "unpush_group",
        Some(g.name),
        "group",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

use crate::models::{
    export::{FolderItemData, GroupData, GroupExportData, IconExportData, WidgetData},
    FolderItem, Icon, Widget,
};

pub async fn export(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<GroupExportData>> {
    require_at_least_admin(user.role)?;

    let group: Group = sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;

    let icons: Vec<Icon> = sqlx::query_as("SELECT * FROM icons WHERE group_id = $1 ORDER BY sort_order ASC")
        .bind(id)
        .fetch_all(&state.pg)
        .await?;

    let widgets: Vec<Widget> = sqlx::query_as("SELECT * FROM widgets WHERE group_id = $1 ORDER BY sort_order ASC")
        .bind(id)
        .fetch_all(&state.pg)
        .await?;

    let icon_ids: Vec<Uuid> = icons.iter().map(|i| i.id).collect();
    let folder_items: Vec<FolderItem> = if icon_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as("SELECT * FROM folder_items WHERE folder_icon_id = ANY($1) ORDER BY sort_order ASC")
            .bind(&icon_ids)
            .fetch_all(&state.pg)
            .await?
    };

    let icon_data_list = icons.into_iter().map(|ic| {
        let items = folder_items
            .iter()
            .filter(|f| f.folder_icon_id == ic.id)
            .map(|f| FolderItemData {
                name: f.name.clone(),
                letter: f.letter.clone(),
                color: f.color,
                url: f.url.clone(),
                image_url: f.image_url.clone(),
                image_style: f.image_style.clone(),
                image_radius: f.image_radius.clone(),
                sort_order: f.sort_order,
            })
            .collect();

        IconExportData {
            name: ic.name,
            url: ic.url,
            sub: ic.sub,
            title: ic.title,
            cta: ic.cta,
            size: ic.size,
            letter: ic.letter,
            color: ic.color,
            image_url: ic.image_url,
            image_style: ic.image_style,
            image_radius: ic.image_radius,
            is_folder: ic.is_folder,
            iframe_preview: ic.iframe_preview,
            sort_order: ic.sort_order,
            folder_items: items,
        }
    }).collect();

    let widget_data_list = widgets.into_iter().map(|w| WidgetData {
        widget: w.widget_type,
        w_span: w.w_span,
        w_row: w.w_row,
        config: w.config,
        sort_order: w.sort_order,
    }).collect();

    Ok(Json(GroupExportData {
        group: GroupData {
            name: group.name.clone(),
            icon: group.icon.clone(),
        },
        icons: icon_data_list,
        widgets: widget_data_list,
    }))
}

pub async fn import(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(payload): Json<GroupExportData>,
) -> AppResult<(StatusCode, Json<Group>)> {
    require_at_least_admin(user.role)?;

    let mut tx = state.pg.begin().await?;

    let new_group: Group = sqlx::query_as(
        "INSERT INTO groups (id, name, icon, owner_id, pushed, sort_order) \
         VALUES (gen_random_uuid(), $1, $2, $3, FALSE, \
           COALESCE((SELECT MAX(sort_order)+1 FROM groups WHERE owner_id = $3), 100)) \
         RETURNING *"
    )
    .bind(&payload.group.name)
    .bind(&payload.group.icon)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    for ic in payload.icons {
        let new_icon: Icon = sqlx::query_as(
            "INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, image_url, image_style, image_radius, is_folder, iframe_preview, sort_order) \
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) \
             RETURNING *"
        )
        .bind(new_group.id)
        .bind(ic.name)
        .bind(ic.url)
        .bind(ic.sub)
        .bind(ic.title)
        .bind(ic.cta)
        .bind(ic.size)
        .bind(ic.letter)
        .bind(ic.color)
        .bind(ic.image_url)
        .bind(ic.image_style)
        .bind(ic.image_radius)
        .bind(ic.is_folder)
        .bind(ic.iframe_preview)
        .bind(ic.sort_order)
        .fetch_one(&mut *tx)
        .await?;

        for f in ic.folder_items {
            sqlx::query(
                "INSERT INTO folder_items (id, folder_icon_id, name, letter, color, url, image_url, image_style, image_radius, sort_order) \
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)"
            )
            .bind(new_icon.id)
            .bind(f.name)
            .bind(f.letter)
            .bind(f.color)
            .bind(f.url)
            .bind(f.image_url)
            .bind(f.image_style)
            .bind(f.image_radius)
            .bind(f.sort_order)
            .execute(&mut *tx)
            .await?;
        }
    }

    for w in payload.widgets {
        sqlx::query(
            "INSERT INTO widgets (id, group_id, widget_type, w_span, w_row, config, sort_order) \
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)"
        )
        .bind(new_group.id)
        .bind(w.widget)
        .bind(w.w_span)
        .bind(w.w_row)
        .bind(w.config)
        .bind(w.sort_order)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    util::audit(
        &state,
        Some(&user),
        "import_group",
        Some(payload.group.name),
        "group",
        None,
    )
    .await;

    Ok((StatusCode::CREATED, Json(new_group)))
}
