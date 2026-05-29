use crate::{
    error::AppResult,
    models::{
        FolderItem, FolderItemView, Group, GroupView, Icon, IconView, PreferencesView, Role,
        SessionUser, UserPreferences, Widget, WidgetView,
    },
    state::AppState,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Extension,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResp {
    pub groups: Vec<GroupView>,
    pub icons: Vec<IconView>,
    pub widgets: Vec<WidgetView>,
    pub preferences: crate::models::PreferencesView,
    pub iframe_whitelist: Vec<String>,
    /// 游客模式时为 true,前端据此隐藏编辑/偏好相关入口
    pub guest: bool,
}

pub async fn get_workspace(
    State(state): State<Arc<AppState>>,
    Extension(maybe_user): Extension<Option<SessionUser>>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let is_guest = maybe_user.is_none();
    let user_role = maybe_user.as_ref().map(|u| u.role).unwrap_or(Role::Guest);
    let user_id: Option<Uuid> = maybe_user.as_ref().map(|u| u.id);

    // Groups: pushed (all users) + owned (mine) + public(owner NULL, not pushed — admin-only maintenance,
    // still visible to everyone as read-only unless admin+)
    let groups: Vec<Group> = if user_role.at_least_admin() {
        sqlx::query_as(
            "SELECT g.*, 
                    COALESCE(u.display_name, u.username) AS owner_name
             FROM groups g 
             LEFT JOIN users u ON g.owner_id = u.id 
             ORDER BY g.sort_order ASC, g.created_at ASC",
        )
        .fetch_all(&state.pg)
        .await?
    } else if let Some(uid) = user_id {
        sqlx::query_as(
            "SELECT g.*, 
                    COALESCE(u.display_name, u.username) AS owner_name
             FROM groups g 
             LEFT JOIN users u ON g.owner_id = u.id 
             WHERE g.owner_id = $1 OR g.owner_id IS NULL OR 
                   (g.pushed = TRUE AND (
                       g.push_target_type = 'all' OR 
                       (g.push_target_type = 'role' AND g.push_target_role = $2) OR 
                       (g.push_target_type = 'user' AND g.push_target_user_id = $1)
                   ))
             ORDER BY g.sort_order ASC, g.created_at ASC",
        )
        .bind(uid)
        .bind(user_role.as_str())
        .fetch_all(&state.pg)
        .await?
    } else {
        // 游客:仅可见推给了 all, 或者是 role=guest
        sqlx::query_as(
            "SELECT g.*, 
                    COALESCE(u.display_name, u.username) AS owner_name
             FROM groups g 
             LEFT JOIN users u ON g.owner_id = u.id 
             WHERE g.pushed = TRUE AND (
                 g.push_target_type = 'all' OR 
                 (g.push_target_type = 'role' AND g.push_target_role = 'guest')
             )
             ORDER BY g.sort_order ASC, g.created_at ASC",
        )
        .fetch_all(&state.pg)
        .await?
    };

    let group_ids: Vec<Uuid> = groups.iter().map(|g| g.id).collect();

    // icons + widgets are independent — fetch in parallel to halve workspace latency.
    let icons_fut = sqlx::query_as::<_, Icon>(
        "SELECT * FROM icons WHERE group_id = ANY($1) ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(&group_ids)
    .fetch_all(&state.pg);
    let widgets_fut = sqlx::query_as::<_, Widget>(
        "SELECT * FROM widgets WHERE group_id = ANY($1) ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(&group_ids)
    .fetch_all(&state.pg);
    let (icons, widgets) = tokio::try_join!(icons_fut, widgets_fut)?;

    let icon_ids: Vec<Uuid> = icons.iter().filter(|i| i.is_folder).map(|i| i.id).collect();
    let folder_items: Vec<FolderItem> = if icon_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as(
            "SELECT * FROM folder_items WHERE folder_icon_id = ANY($1) \
             ORDER BY folder_icon_id, sort_order ASC",
        )
        .bind(&icon_ids)
        .fetch_all(&state.pg)
        .await?
    };

    let mut folder_map: HashMap<Uuid, Vec<FolderItemView>> = HashMap::new();
    for it in folder_items {
        folder_map
            .entry(it.folder_icon_id)
            .or_default()
            .push(it.into());
    }

    let group_ro: HashMap<Uuid, (bool, Option<Uuid>, bool)> = groups
        .iter()
        .map(|g| (g.id, (g.pushed, g.owner_id, g.push_allow_edit)))
        .collect();
    let can_edit = |gid: Uuid| {
        if user_role.at_least_admin() {
            return true;
        }
        match (group_ro.get(&gid), user_id) {
            (Some((pushed, owner, push_allow_edit)), Some(uid)) => {
                (!*pushed && *owner == Some(uid)) || (*pushed && *push_allow_edit)
            }
            _ => false,
        }
    };

    let group_views: Vec<GroupView> = groups
        .into_iter()
        .map(|g| GroupView {
            read_only: !(user_role.at_least_admin()
                || (!g.pushed && user_id.is_some() && g.owner_id == user_id)
                || (g.pushed && g.push_allow_edit)),
            id: g.id,
            name: g.name,
            icon: g.icon,
            owner_id: g.owner_id,
            owner_name: g.owner_name,
            pushed: g.pushed,
            push_target_type: g.push_target_type,
            push_target_role: g.push_target_role,
            push_target_user_id: g.push_target_user_id,
            push_allow_edit: g.push_allow_edit,
            sort_order: g.sort_order,
        })
        .collect();

    let icon_views: Vec<IconView> = icons
        .into_iter()
        .map(|i| {
            let items = folder_map.remove(&i.id).unwrap_or_default();
            IconView {
                read_only: !can_edit(i.group_id),
                id: i.id,
                group_id: i.group_id,
                name: i.name,
                url: i.url,
                sub: i.sub,
                title: i.title,
                cta: i.cta,
                size: i.size,
                letter: i.letter,
                color: i.color,
                image_url: i.image_url,
                image_style: i.image_style,
                image_radius: i.image_radius,
                is_folder: i.is_folder,
                iframe_preview: i.iframe_preview,
                sort_order: i.sort_order,
                grid_x: i.grid_x,
                grid_y: i.grid_y,
                font_size: i.font_size,
                text_align: i.text_align,
                folder_items: items,
            }
        })
        .collect();

    let widget_views: Vec<WidgetView> = widgets
        .into_iter()
        .map(|w| WidgetView {
            read_only: !can_edit(w.group_id),
            id: w.id,
            group_id: w.group_id,
            widget: w.widget_type,
            w_span: w.w_span,
            w_row: w.w_row,
            config: w.config,
            sort_order: w.sort_order,
            grid_x: w.grid_x,
            grid_y: w.grid_y,
        })
        .collect();

    let preferences: PreferencesView = match user_id {
        Some(uid) => ensure_prefs(&state, uid).await?.into(),
        None => PreferencesView::default(),
    };

    let resp = WorkspaceResp {
        groups: group_views,
        icons: icon_views,
        widgets: widget_views,
        preferences,
        iframe_whitelist: state.cfg.app.iframe_whitelist.clone(),
        guest: is_guest,
    };

    // ETag lets the client (especially on slow trans-Pacific links) skip the
    // body when nothing changed since last fetch. We still run the DB queries
    // — invalidating without a real cache is fine for now since the win is
    // bandwidth, not backend work.
    let body = serde_json::to_vec(&resp)?;
    let etag = make_etag(&body);

    if matches_etag(&headers, &etag) {
        return Ok((
            StatusCode::NOT_MODIFIED,
            [
                (header::ETAG, etag.as_str()),
                (header::CACHE_CONTROL, "no-store"),
            ],
        )
            .into_response());
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::ETAG, etag.as_str()),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response())
}

fn make_etag(body: &[u8]) -> String {
    let digest = Sha256::digest(body);
    // 16 hex chars (64 bits) — plenty for collision avoidance on a per-user
    // resource and keeps the header tiny.
    let short = hex::encode(&digest[..8]);
    format!("\"{short}\"")
}

fn matches_etag(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(|h| h.split(',').any(|t| t.trim() == etag))
        .unwrap_or(false)
}

pub async fn ensure_prefs(state: &Arc<AppState>, user_id: Uuid) -> AppResult<UserPreferences> {
    let existing: Option<UserPreferences> =
        sqlx::query_as("SELECT * FROM user_preferences WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&state.pg)
            .await?;
    if let Some(p) = existing {
        return Ok(p);
    }
    let created: UserPreferences =
        sqlx::query_as("INSERT INTO user_preferences (user_id) VALUES ($1) RETURNING *")
            .bind(user_id)
            .fetch_one(&state.pg)
            .await?;
    Ok(created)
}
