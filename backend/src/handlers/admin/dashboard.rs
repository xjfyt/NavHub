use crate::{
    auth::require_at_least_admin,
    error::AppResult,
    models::{AuditEntry, SessionUser},
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use serde::Serialize;
use sqlx::Row;
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBreakdown {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_users: i64,
    pub online_users: i64,
    pub total_icons: i64,
    pub total_groups: i64,
    pub total_widgets: i64,
    pub total_wallpapers: i64,
    pub wallpaper_image_count: i64,
    pub wallpaper_video_count: i64,
    pub wallpaper_sources_total: i64,
    pub wallpaper_sources_enabled: i64,
    pub total_icon_assets: i64,
    pub icon_asset_sources_total: i64,
    pub icon_asset_sources_enabled: i64,
    pub recent_audit: Vec<AuditEntry>,
    pub roles_distribution: std::collections::HashMap<String, i64>,
    pub top_wallpaper_sources: Vec<SourceBreakdown>,
}

pub async fn get_dashboard(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<DashboardStats>> {
    require_at_least_admin(user.role)?;

    let pool = state.pg.clone();

    // Single round-trip for all the scalar counts — cheaper than 12 individual queries.
    let scalars_q = sqlx::query(
        "SELECT
            (SELECT COUNT(*) FROM users)                                           AS total_users,
            (SELECT COUNT(*) FROM users WHERE last_seen_at > NOW() - INTERVAL '15 minutes') AS online_users,
            (SELECT COUNT(*) FROM icons)                                           AS total_icons,
            (SELECT COUNT(*) FROM groups)                                          AS total_groups,
            (SELECT COUNT(*) FROM widgets)                                         AS total_widgets,
            (SELECT COUNT(*) FROM remote_wallpapers)                               AS total_wallpapers,
            (SELECT COUNT(*) FROM remote_wallpapers WHERE media_type = 'image')    AS wallpaper_image_count,
            (SELECT COUNT(*) FROM remote_wallpapers WHERE media_type = 'video')    AS wallpaper_video_count,
            (SELECT COUNT(*) FROM wallpaper_sources)                               AS wallpaper_sources_total,
            (SELECT COUNT(*) FROM wallpaper_sources WHERE enabled)                 AS wallpaper_sources_enabled,
            (SELECT COUNT(*) FROM remote_icon_assets)                              AS total_icon_assets,
            (SELECT COUNT(*) FROM icon_asset_sources)                              AS icon_asset_sources_total,
            (SELECT COUNT(*) FROM icon_asset_sources WHERE enabled)                AS icon_asset_sources_enabled",
    )
    .fetch_one(&pool);

    let query_roles =
        sqlx::query("SELECT role, COUNT(*) as count FROM users GROUP BY role").fetch_all(&pool);

    let query_audit = sqlx::query_as::<_, AuditEntry>(
        "SELECT id, ts, actor_id, actor_name, action, target, kind, detail \
         FROM audit_log ORDER BY ts DESC LIMIT 5",
    )
    .fetch_all(&pool);

    let query_top_sources = sqlx::query(
        "SELECT ws.name AS name, COUNT(rw.id) AS cnt
         FROM wallpaper_sources ws
         LEFT JOIN remote_wallpapers rw ON rw.source_id = ws.id
         GROUP BY ws.name
         ORDER BY cnt DESC NULLS LAST
         LIMIT 5",
    )
    .fetch_all(&pool);

    let (scalars, roles_rows, recent_audit, top_sources_rows) =
        tokio::try_join!(scalars_q, query_roles, query_audit, query_top_sources)?;

    let mut roles_distribution = std::collections::HashMap::new();
    for row in roles_rows {
        let role: String = row.get("role");
        let count: i64 = row.get("count");
        roles_distribution.insert(role, count);
    }

    let top_wallpaper_sources = top_sources_rows
        .iter()
        .map(|r| SourceBreakdown {
            name: r.get("name"),
            count: r.get::<i64, _>("cnt"),
        })
        .collect();

    Ok(Json(DashboardStats {
        total_users: scalars.get("total_users"),
        online_users: scalars.get("online_users"),
        total_icons: scalars.get("total_icons"),
        total_groups: scalars.get("total_groups"),
        total_widgets: scalars.get("total_widgets"),
        total_wallpapers: scalars.get("total_wallpapers"),
        wallpaper_image_count: scalars.get("wallpaper_image_count"),
        wallpaper_video_count: scalars.get("wallpaper_video_count"),
        wallpaper_sources_total: scalars.get("wallpaper_sources_total"),
        wallpaper_sources_enabled: scalars.get("wallpaper_sources_enabled"),
        total_icon_assets: scalars.get("total_icon_assets"),
        icon_asset_sources_total: scalars.get("icon_asset_sources_total"),
        icon_asset_sources_enabled: scalars.get("icon_asset_sources_enabled"),
        recent_audit,
        roles_distribution,
        top_wallpaper_sources,
    }))
}
