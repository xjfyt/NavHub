//! DATA-8: 个人全量数据导出(GDPR 数据可携带)。
//!
//! `GET /api/me/export` 返回请求者本人的全部数据。端点不接收任何用户标识参数,
//! 一律以会话中的 `user.id` 为准 —— 因此天然不存在 IDOR(用户只能导出自己的数据)。
//! 管理员若需导出他人数据,应另设带 require_at_least_admin 的变体;此处不提供,以免
//! 误开越权口子。
//!
//! JSON 整形逻辑拆成纯函数(shape_* 系列),与 DB 读取解耦,便于单测。

use crate::{
    error::AppResult,
    models::{
        export::{
            ExportedMessageRead, ExportedPreferences, ExportedProfile, ExportedUserGroup,
            FolderItemData, IconExportData, UserDataExport, WidgetData,
        },
        FolderItem, Group, Icon, SessionUser, User, UserPreferences, Widget,
    },
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use chrono::{DateTime, Utc};
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

/// 当前导出格式版本。
pub const EXPORT_FORMAT_VERSION: u32 = 1;

fn ts(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339()
}

fn opt_ts(dt: Option<DateTime<Utc>>) -> Option<String> {
    dt.map(ts)
}

/// 纯整形:User 行 -> 导出用个人资料(剔除 password_hash 等敏感字段)。
pub fn shape_profile(u: &User) -> ExportedProfile {
    ExportedProfile {
        id: u.id.to_string(),
        username: u.username.clone(),
        email: u.email.clone(),
        display_name: u.display_name.clone(),
        avatar_url: u.avatar_url.clone(),
        role: u.role.clone(),
        casdoor_id: u.casdoor_id.clone(),
        created_at: ts(u.created_at),
        updated_at: ts(u.updated_at),
        last_seen_at: opt_ts(u.last_seen_at),
    }
}

/// 纯整形:UserPreferences 行 -> 导出用偏好(含自定义引擎与小组件相关偏好)。
pub fn shape_preferences(p: &UserPreferences) -> ExportedPreferences {
    ExportedPreferences {
        tweaks: p.tweaks.clone(),
        custom_engines: p.custom_engines.clone(),
        pushed_group_wallpapers: p.pushed_group_wallpapers.clone(),
        sidebar_order: p.sidebar_order.iter().map(|id| id.to_string()).collect(),
    }
}

/// 纯整形:FolderItem 行 -> 导出结构(不嵌入二进制资产,仅保留 image_url 引用)。
pub fn shape_folder_item(f: &FolderItem) -> FolderItemData {
    FolderItemData {
        name: f.name.clone(),
        letter: f.letter.clone(),
        color: f.color,
        url: f.url.clone(),
        image_url: f.image_url.clone(),
        image_asset: None,
        image_style: f.image_style.clone(),
        image_radius: f.image_radius.clone(),
        sort_order: f.sort_order,
    }
}

/// 纯整形:Icon 行 + 其文件夹子项 -> 导出结构。
pub fn shape_icon(ic: &Icon, folder_items: &[FolderItem]) -> IconExportData {
    IconExportData {
        name: ic.name.clone(),
        url: ic.url.clone(),
        sub: ic.sub.clone(),
        title: ic.title.clone(),
        cta: ic.cta.clone(),
        size: ic.size.clone(),
        letter: ic.letter.clone(),
        color: ic.color,
        image_url: ic.image_url.clone(),
        image_asset: None,
        image_style: ic.image_style.clone(),
        image_radius: ic.image_radius.clone(),
        is_folder: ic.is_folder,
        iframe_preview: ic.iframe_preview,
        sort_order: ic.sort_order,
        font_size: ic.font_size.clone(),
        text_align: ic.text_align.clone(),
        folder_items: folder_items.iter().map(shape_folder_item).collect(),
    }
}

/// 纯整形:Widget 行 -> 导出结构。
pub fn shape_widget(w: &Widget) -> WidgetData {
    WidgetData {
        widget: w.widget_type.clone(),
        w_span: w.w_span,
        w_row: w.w_row,
        config: w.config.clone(),
        sort_order: w.sort_order,
    }
}

/// 纯整形:把分组 + 其图标(及每个图标的文件夹子项)+ 小组件组装成导出结构。
/// 与 DB 解耦,便于单测分组/图标/子项/小组件的嵌套整形是否正确。
pub fn shape_group(
    g: &Group,
    icons: &[Icon],
    folder_items_by_icon: &HashMap<Uuid, Vec<FolderItem>>,
    widgets: &[Widget],
) -> ExportedUserGroup {
    let empty: Vec<FolderItem> = Vec::new();
    ExportedUserGroup {
        id: g.id.to_string(),
        name: g.name.clone(),
        icon: g.icon.clone(),
        sort_order: g.sort_order,
        created_at: ts(g.created_at),
        icons: icons
            .iter()
            .map(|ic| {
                let items = folder_items_by_icon.get(&ic.id).unwrap_or(&empty);
                shape_icon(ic, items)
            })
            .collect(),
        widgets: widgets.iter().map(shape_widget).collect(),
    }
}

/// 纯整形:组装最终导出文档。groups 已按分组整形完毕。
pub fn assemble_export(
    exported_at: DateTime<Utc>,
    profile: ExportedProfile,
    preferences: ExportedPreferences,
    groups: Vec<ExportedUserGroup>,
    message_reads: Vec<ExportedMessageRead>,
) -> UserDataExport {
    UserDataExport {
        format_version: EXPORT_FORMAT_VERSION,
        exported_at: ts(exported_at),
        profile,
        preferences,
        groups,
        message_reads,
    }
}

/// DATA-8: 个人全量数据导出端点。仅导出 `user.id` 本人数据 —— 无路径/查询参数承载
/// 目标用户,因此不存在越权(IDOR)。
pub async fn export_my_data(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<UserDataExport>> {
    // 个人资料(剔除 password_hash —— User 的 password_hash 标了 #[serde(skip)],
    // 这里也只取整形后的字段,绝不外泄密码哈希)。
    let profile_row: User = sqlx::query_as(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;

    // 偏好(自定义引擎 / 小组件相关偏好都在其中)。复用 ensure_prefs:行不存在则建默认行。
    let prefs_row: UserPreferences =
        crate::handlers::workspace::ensure_prefs(&state, user.id).await?;

    // 仅导出本人拥有的分组(owner_id = 本人)。推送给本人的分组归属他人,不在导出范围内。
    let groups: Vec<Group> = sqlx::query_as(
        "SELECT * FROM groups WHERE owner_id = $1 ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(user.id)
    .fetch_all(&state.pg)
    .await?;

    let group_ids: Vec<Uuid> = groups.iter().map(|g| g.id).collect();

    let icons: Vec<Icon> = if group_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT * FROM icons WHERE group_id = ANY($1) ORDER BY sort_order ASC, created_at ASC",
        )
        .bind(&group_ids)
        .fetch_all(&state.pg)
        .await?
    };

    let folder_icon_ids: Vec<Uuid> = icons.iter().filter(|i| i.is_folder).map(|i| i.id).collect();
    let folder_items: Vec<FolderItem> = if folder_icon_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT * FROM folder_items WHERE folder_icon_id = ANY($1) ORDER BY sort_order ASC",
        )
        .bind(&folder_icon_ids)
        .fetch_all(&state.pg)
        .await?
    };

    let widgets: Vec<Widget> = if group_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT * FROM widgets WHERE group_id = ANY($1) ORDER BY sort_order ASC, created_at ASC",
        )
        .bind(&group_ids)
        .fetch_all(&state.pg)
        .await?
    };

    let message_reads: Vec<ExportedMessageRead> = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "SELECT message_id, read_at FROM message_reads WHERE user_id = $1 ORDER BY read_at ASC",
    )
    .bind(user.id)
    .fetch_all(&state.pg)
    .await?
    .into_iter()
    .map(|(mid, read_at)| ExportedMessageRead {
        message_id: mid.to_string(),
        read_at: ts(read_at),
    })
    .collect();

    // 按归属关系把图标/子项/小组件分桶,再交由纯整形函数组装(整形逻辑可单测)。
    let mut icons_by_group: HashMap<Uuid, Vec<Icon>> = HashMap::new();
    for ic in icons {
        icons_by_group.entry(ic.group_id).or_default().push(ic);
    }
    let mut folder_items_by_icon: HashMap<Uuid, Vec<FolderItem>> = HashMap::new();
    for f in folder_items {
        folder_items_by_icon
            .entry(f.folder_icon_id)
            .or_default()
            .push(f);
    }
    let mut widgets_by_group: HashMap<Uuid, Vec<Widget>> = HashMap::new();
    for w in widgets {
        widgets_by_group.entry(w.group_id).or_default().push(w);
    }

    let empty_icons: Vec<Icon> = Vec::new();
    let empty_widgets: Vec<Widget> = Vec::new();
    let group_exports: Vec<ExportedUserGroup> = groups
        .iter()
        .map(|g| {
            let gi = icons_by_group.get(&g.id).unwrap_or(&empty_icons);
            let gw = widgets_by_group.get(&g.id).unwrap_or(&empty_widgets);
            shape_group(g, gi, &folder_items_by_icon, gw)
        })
        .collect();

    let export = assemble_export(
        Utc::now(),
        shape_profile(&profile_row),
        shape_preferences(&prefs_row),
        group_exports,
        message_reads,
    );

    Ok(Json(export))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_user() -> User {
        let now = Utc::now();
        User {
            id: Uuid::nil(),
            username: "alice".into(),
            email: "alice@example.com".into(),
            display_name: Some("Alice".into()),
            avatar_url: None,
            role: "user".into(),
            password_hash: Some("SECRET_HASH".into()),
            casdoor_id: None,
            created_at: now,
            updated_at: now,
            last_seen_at: None,
            must_change_password: false,
        }
    }

    #[test]
    fn profile_excludes_password_hash() {
        let u = sample_user();
        let p = shape_profile(&u);
        // 整形后的结构里没有任何密码字段;序列化结果也绝不应包含哈希。
        let serialized = serde_json::to_string(&p).unwrap();
        assert!(!serialized.contains("SECRET_HASH"));
        assert!(!serialized.to_lowercase().contains("password"));
        assert_eq!(p.username, "alice");
        assert_eq!(p.id, Uuid::nil().to_string());
    }

    #[test]
    fn preferences_shape_maps_fields_and_sidebar_ids() {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let prefs = UserPreferences {
            user_id: Uuid::nil(),
            tweaks: json!({"theme": "dark"}),
            custom_engines: json!([{"name": "DDG"}]),
            pushed_group_wallpapers: json!({}),
            sidebar_order: vec![id],
            updated_at: now,
        };
        let e = shape_preferences(&prefs);
        assert_eq!(e.tweaks, json!({"theme": "dark"}));
        assert_eq!(e.custom_engines, json!([{"name": "DDG"}]));
        assert_eq!(e.sidebar_order, vec![id.to_string()]);
    }

    fn sample_icon(id: Uuid, group_id: Uuid, is_folder: bool, name: &str) -> Icon {
        let now = Utc::now();
        Icon {
            id,
            group_id,
            name: name.into(),
            url: Some("https://x".into()),
            sub: None,
            title: None,
            cta: None,
            size: "sq".into(),
            letter: None,
            color: 0,
            image_url: Some("/uploads/icons/a.png".into()),
            image_style: "plain".into(),
            image_radius: "rounded".into(),
            is_folder,
            iframe_preview: false,
            sort_order: 1,
            grid_x: None,
            grid_y: None,
            font_size: "md".into(),
            text_align: "center".into(),
            created_at: now,
            updated_at: now,
        }
    }

    fn sample_folder_item(folder_icon_id: Uuid, name: &str) -> FolderItem {
        FolderItem {
            id: Uuid::new_v4(),
            folder_icon_id,
            name: name.into(),
            letter: None,
            color: 0,
            url: Some("https://y".into()),
            image_url: None,
            image_style: "plain".into(),
            image_radius: "rounded".into(),
            sort_order: 0,
        }
    }

    fn sample_widget(group_id: Uuid) -> Widget {
        let now = Utc::now();
        Widget {
            id: Uuid::new_v4(),
            group_id,
            widget_type: "clock".into(),
            w_span: 2,
            w_row: Some(1),
            config: json!({"tz": "UTC"}),
            sort_order: 3,
            grid_x: None,
            grid_y: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn sample_group(id: Uuid) -> Group {
        let now = Utc::now();
        Group {
            id,
            name: "G".into(),
            icon: "grid".into(),
            owner_id: Some(Uuid::nil()),
            pushed: false,
            push_target_type: "all".into(),
            push_target_role: None,
            push_target_user_id: None,
            push_allow_edit: false,
            sort_order: 5,
            created_at: now,
            updated_at: now,
            owner_name: None,
        }
    }

    #[test]
    fn group_shape_nests_icons_folder_items_and_widgets() {
        let gid = Uuid::new_v4();
        let folder_id = Uuid::new_v4();
        let plain_id = Uuid::new_v4();
        let g = sample_group(gid);
        let icons = vec![
            sample_icon(folder_id, gid, true, "Folder"),
            sample_icon(plain_id, gid, false, "Plain"),
        ];
        let mut folder_items_by_icon: HashMap<Uuid, Vec<FolderItem>> = HashMap::new();
        folder_items_by_icon.insert(
            folder_id,
            vec![
                sample_folder_item(folder_id, "child-a"),
                sample_folder_item(folder_id, "child-b"),
            ],
        );
        let widgets = vec![sample_widget(gid)];

        let out = shape_group(&g, &icons, &folder_items_by_icon, &widgets);
        assert_eq!(out.id, gid.to_string());
        assert_eq!(out.icons.len(), 2);
        // 文件夹图标带 2 个子项,普通图标无子项。
        let folder = out.icons.iter().find(|i| i.is_folder).unwrap();
        assert_eq!(folder.folder_items.len(), 2);
        assert_eq!(folder.folder_items[0].name, "child-a");
        let plain = out.icons.iter().find(|i| !i.is_folder).unwrap();
        assert!(plain.folder_items.is_empty());
        // 小组件正确整形。
        assert_eq!(out.widgets.len(), 1);
        assert_eq!(out.widgets[0].widget, "clock");
        assert_eq!(out.widgets[0].config, json!({"tz": "UTC"}));
        // 整形不嵌入二进制资产(仅保留 image_url 引用)。
        assert!(plain.image_asset.is_none());
    }

    #[test]
    fn assemble_sets_version_and_passes_through() {
        let prof = shape_profile(&sample_user());
        let prefs = ExportedPreferences {
            tweaks: json!({}),
            custom_engines: json!([]),
            pushed_group_wallpapers: json!({}),
            sidebar_order: vec![],
        };
        let out = assemble_export(Utc::now(), prof, prefs, vec![], vec![]);
        assert_eq!(out.format_version, EXPORT_FORMAT_VERSION);
        assert!(out.groups.is_empty());
        assert!(out.message_reads.is_empty());
    }
}
