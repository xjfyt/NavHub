use crate::{
    error::{AppError, AppResult},
    handlers::util,
    models::{Group, Icon, IconView, IconCreate, IconReorderRequest, IconUpdate, SessionUser},
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
    Json(body): Json<IconCreate>,
) -> AppResult<(StatusCode, Json<IconView>)> {
    let g = load_group(&state, body.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    let icon: Icon = sqlx::query_as(
        "INSERT INTO icons (group_id, name, url, sub, title, cta, size, letter, color, image_url, image_style, image_radius, is_folder, iframe_preview, font_size, text_align, sort_order) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, \
           COALESCE((SELECT MAX(sort_order)+1 FROM icons WHERE group_id=$1), 0)) RETURNING *"
    )
    .bind(body.group_id)
    .bind(&body.name)
    .bind(body.url.as_deref())
    .bind(body.sub.as_deref())
    .bind(body.title.as_deref())
    .bind(body.cta.as_deref())
    .bind(&body.size)
    .bind(body.letter.as_deref())
    .bind(body.color)
    .bind(body.image_url.as_deref())
    .bind(&body.image_style)
    .bind(&body.image_radius)
    .bind(body.is_folder)
    .bind(body.iframe_preview)
    .bind(&body.font_size)
    .bind(&body.text_align)
    .fetch_one(&state.pg)
    .await?;
    util::audit(
        &state,
        Some(&user),
        "create_icon",
        Some(icon.name.clone()),
        "icon",
        None,
    )
    .await;
    let view = IconView {
        id: icon.id,
        group_id: icon.group_id,
        name: icon.name,
        url: icon.url,
        sub: icon.sub,
        title: icon.title,
        cta: icon.cta,
        size: icon.size,
        letter: icon.letter,
        color: icon.color,
        image_url: icon.image_url,
        image_style: icon.image_style,
        image_radius: icon.image_radius,
        is_folder: icon.is_folder,
        iframe_preview: icon.iframe_preview,
        sort_order: icon.sort_order,
        grid_x: icon.grid_x,
        grid_y: icon.grid_y,
        font_size: icon.font_size,
        text_align: icon.text_align,
        folder_items: vec![],
        read_only: false,
    };
    Ok((StatusCode::CREATED, Json(view)))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<IconUpdate>,
) -> AppResult<Json<IconView>> {
    let existing: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, existing.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    // If changing group, also verify destination writable
    if let Some(new_gid) = body.group_id {
        if new_gid != existing.group_id {
            let g2 = load_group(&state, new_gid).await?;
            if !util::group_writable_by(g2.owner_id, g2.pushed, g2.push_allow_edit, &user) {
                return Err(AppError::Forbidden("target_not_writable"));
            }
        }
    }
    let updated: Icon = sqlx::query_as(
        "UPDATE icons SET \
           name = COALESCE($1, name), \
           url = COALESCE($2, url), \
           sub = COALESCE($3, sub), \
           title = COALESCE($4, title), \
           cta = COALESCE($5, cta), \
           size = COALESCE($6, size), \
           letter = COALESCE($7, letter), \
           color = COALESCE($8, color), \
           image_url = COALESCE($9, image_url), \
           image_style = COALESCE($10, image_style), \
           image_radius = COALESCE($11, image_radius), \
           iframe_preview = COALESCE($12, iframe_preview), \
           group_id = COALESCE($13, group_id), \
           font_size = COALESCE($14, font_size), \
           text_align = COALESCE($15, text_align), \
           updated_at = now() \
         WHERE id = $16 RETURNING *",
    )
    .bind(body.name.as_deref())
    .bind(body.url.as_deref())
    .bind(body.sub.as_deref())
    .bind(body.title.as_deref())
    .bind(body.cta.as_deref())
    .bind(body.size.as_deref())
    .bind(body.letter.as_deref())
    .bind(body.color)
    .bind(body.image_url.as_deref())
    .bind(body.image_style.as_deref())
    .bind(body.image_radius.as_deref())
    .bind(body.iframe_preview)
    .bind(body.group_id)
    .bind(body.font_size.as_deref())
    .bind(body.text_align.as_deref())
    .bind(id)
    .fetch_one(&state.pg)
    .await?;
    util::audit(
        &state,
        Some(&user),
        "update_icon",
        Some(updated.name.clone()),
        "icon",
        None,
    )
    .await;

    let view = load_icon_view(state.clone(), &updated).await?;
    Ok(Json(view))
}

pub async fn load_icon_view(state: Arc<AppState>, icon: &Icon) -> AppResult<IconView> {
    let items = if icon.is_folder {
        sqlx::query_as::<_, crate::models::FolderItem>("SELECT * FROM folder_items WHERE folder_icon_id = $1 ORDER BY sort_order ASC")
            .bind(icon.id)
            .fetch_all(&state.pg)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|i| i.into())
            .collect()
    } else {
        vec![]
    };

    Ok(IconView {
        id: icon.id,
        group_id: icon.group_id,
        name: icon.name.clone(),
        url: icon.url.clone(),
        sub: icon.sub.clone(),
        title: icon.title.clone(),
        cta: icon.cta.clone(),
        size: icon.size.clone(),
        letter: icon.letter.clone(),
        color: icon.color,
        image_url: icon.image_url.clone(),
        image_style: icon.image_style.clone(),
        image_radius: icon.image_radius.clone(),
        is_folder: icon.is_folder,
        iframe_preview: icon.iframe_preview,
        sort_order: icon.sort_order,
        grid_x: icon.grid_x,
        grid_y: icon.grid_y,
        font_size: icon.font_size.clone(),
        text_align: icon.text_align.clone(),
        folder_items: items,
        read_only: false,
    })
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, existing.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    sqlx::query("DELETE FROM icons WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;
    util::audit(
        &state,
        Some(&user),
        "delete_icon",
        Some(existing.name),
        "icon",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<IconReorderRequest>,
) -> AppResult<StatusCode> {
    let g = load_group(&state, body.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    let mut tx = state.pg.begin().await?;
    for (i, iid) in body.order.iter().enumerate() {
        sqlx::query("UPDATE icons SET sort_order = $1 WHERE id = $2 AND group_id = $3")
            .bind(i as i32)
            .bind(iid)
            .bind(body.group_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Merge `source` icon into `target`. If target is a folder, append source as an item.
/// Otherwise, promote target to folder and include both.
pub async fn merge_into(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path((source_id, target_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<IconView>> {
    if source_id == target_id {
        return Err(AppError::BadRequest("source == target".into()));
    }
    let src: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(source_id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let tgt: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(target_id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, tgt.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    let mut tx = state.pg.begin().await?;

    if tgt.is_folder {
        // append src into target folder
        sqlx::query(
            "INSERT INTO folder_items (folder_icon_id, name, letter, color, url, image_url, image_style, image_radius, sort_order) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE((SELECT MAX(sort_order)+1 FROM folder_items WHERE folder_icon_id=$1), 0))",
        )
        .bind(tgt.id)
        .bind(&src.name)
        .bind(src.letter.as_deref())
        .bind(src.color)
        .bind(src.url.as_deref())
        .bind(src.image_url.as_deref())
        .bind(&src.image_style)
        .bind(&src.image_radius)
        .execute(&mut *tx)
        .await?;
        sqlx::query("DELETE FROM icons WHERE id = $1")
            .bind(src.id)
            .execute(&mut *tx)
            .await?;
    } else {
        // Promote target to folder and include both
        sqlx::query("UPDATE icons SET is_folder = TRUE, name = COALESCE(NULLIF(name, ''), '新建文件夹'), updated_at = now() WHERE id = $1")
            .bind(tgt.id)
            .execute(&mut *tx)
            .await?;
        for (i, ic) in [&tgt, &src].iter().enumerate() {
            sqlx::query(
                "INSERT INTO folder_items (folder_icon_id, name, letter, color, url, image_url, image_style, image_radius, sort_order) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(tgt.id)
            .bind(&ic.name)
            .bind(ic.letter.as_deref())
            .bind(ic.color)
            .bind(ic.url.as_deref())
            .bind(ic.image_url.as_deref())
            .bind(&ic.image_style)
            .bind(&ic.image_radius)
            .bind(i as i32)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query("DELETE FROM icons WHERE id = $1")
            .bind(src.id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    util::audit(
        &state,
        Some(&user),
        "merge_icons",
        Some(tgt.name.clone()),
        "icon",
        None,
    )
    .await;
    
    // load updated target
    let updated_tgt: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(tgt.id)
        .fetch_one(&state.pg)
        .await?;
    let view = load_icon_view(state.clone(), &updated_tgt).await?;
    Ok(Json(view))
}

pub async fn extract_item(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path((folder_id, item_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Vec<IconView>>> {
    let folder: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1 AND is_folder = TRUE")
        .bind(folder_id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
    let g = load_group(&state, folder.group_id).await?;
    if !util::group_writable_by(g.owner_id, g.pushed, g.push_allow_edit, &user) {
        return Err(AppError::Forbidden("not_owner"));
    }
    
    let mut tx = state.pg.begin().await?;
    let item: crate::models::FolderItem = sqlx::query_as("SELECT * FROM folder_items WHERE id = $1 AND folder_icon_id = $2")
        .bind(item_id)
        .bind(folder_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AppError::NotFound)?;
        
    let extracted_icon: Icon = sqlx::query_as(
        "INSERT INTO icons (group_id, name, letter, color, url, image_url, image_style, image_radius, sort_order) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE((SELECT MAX(sort_order)+1 FROM icons WHERE group_id=$1), 0)) RETURNING *"
    )
    .bind(folder.group_id)
    .bind(&item.name)
    .bind(item.letter.as_deref())
    .bind(item.color)
    .bind(item.url.as_deref())
    .bind(item.image_url.as_deref())
    .bind(&item.image_style)
    .bind(&item.image_radius)
    .fetch_one(&mut *tx)
    .await?;
    
    sqlx::query("DELETE FROM folder_items WHERE id = $1")
        .bind(item_id)
        .execute(&mut *tx)
        .await?;
        
    tx.commit().await?;
    util::audit(&state, Some(&user), "extract_folder_item", Some(item.name.clone()), "icon", None).await;

    let updated_folder: Icon = sqlx::query_as("SELECT * FROM icons WHERE id = $1")
        .bind(folder.id)
        .fetch_one(&state.pg)
        .await?;
    let view_folder = load_icon_view(state.clone(), &updated_folder).await?;
    let view_extracted = load_icon_view(state.clone(), &extracted_icon).await?;
    Ok(Json(vec![view_folder, view_extracted]))
}
