//! HTTP route table. Kept separate from `main.rs` so the wiring is reviewable
//! without skipping past several hundred lines of boilerplate.

use crate::{auth, handlers, state::AppState};
use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderValue},
    routing::{get, patch, post},
    Router,
};
use std::sync::Arc;

pub fn build(state: &Arc<AppState>) -> Router<Arc<AppState>> {
    // Endpoints that work for guests too. These are either:
    //   - per-user views that simply return a guest-flavored payload (workspace), or
    //   - stateless reads that should match what the page actually renders for
    //     a guest (favicon proxy, wallpaper list — both backing visuals on
    //     admin-pushed content that guests are allowed to see).
    let api_guest = Router::new()
        .route("/workspace", get(handlers::workspace::get_workspace))
        .route("/wallpapers", get(handlers::wallpapers::list_wallpapers))
        .route("/wallpapers/:id", get(handlers::wallpapers::get_wallpaper))
        .route(
            "/wallpaper-sources",
            get(handlers::wallpapers::list_sources),
        )
        .route("/favicon", get(handlers::favicon::proxy))
        .route("/favicon/search", get(handlers::favicon::search))
        .route("/healthz", get(crate::healthz))
        .route("/readyz", get(crate::readyz))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::optional_login,
        ));

    let api = Router::new()
        .route(
            "/me",
            get(handlers::me::get_me).patch(handlers::me::patch_me),
        )
        // DATA-8: 个人全量数据导出(GDPR 可携带)。仅导出会话用户本人数据,无 IDOR。
        .route("/me/export", get(handlers::me_export::export_my_data))
        .route(
            "/me/preferences",
            get(handlers::prefs::get_prefs).patch(handlers::prefs::patch_prefs),
        )
        .route(
            "/me/engines",
            get(handlers::prefs::list_engines).post(handlers::prefs::add_engine),
        )
        .route("/me/messages", get(handlers::messages::list))
        .route(
            "/me/messages/read-all",
            post(handlers::messages::mark_all_read),
        )
        .route("/me/messages/:id/read", post(handlers::messages::mark_read))
        .route(
            "/me/engines/:id",
            axum::routing::delete(handlers::prefs::delete_engine),
        )
        .route("/groups", post(handlers::groups::create))
        .route(
            "/groups/:id",
            patch(handlers::groups::update).delete(handlers::groups::delete),
        )
        .route("/groups/reorder", post(handlers::groups::reorder))
        .route(
            "/groups/:id/reorder-items",
            post(handlers::groups::reorder_items),
        )
        .route("/icons", post(handlers::icons::create))
        .route(
            "/icons/:id",
            patch(handlers::icons::update).delete(handlers::icons::delete),
        )
        .route(
            "/icons/:id/merge-into/:target",
            post(handlers::icons::merge_into),
        )
        .route(
            "/icons/:id/extract-item/:target",
            post(handlers::icons::extract_item),
        )
        .route("/icons/reorder", post(handlers::icons::reorder))
        .route(
            "/icons/:id/reorder-folder-items",
            post(handlers::icons::reorder_folder_items),
        )
        .route("/widgets", post(handlers::widgets::create))
        .route(
            "/widgets/:id",
            patch(handlers::widgets::update).delete(handlers::widgets::delete),
        )
        .route(
            "/upload",
            post(handlers::upload::upload).layer(DefaultBodyLimit::max(
                (state.cfg.app.upload_max_mb * 1024 * 1024) as usize,
            )),
        )
        .route("/widgets/weather", get(handlers::widgets::weather))
        .route("/widgets/hot", get(handlers::widgets::hot))
        .route("/widgets/music/search", get(handlers::music::search))
        .route("/widgets/music/song/:id", get(handlers::music::song))
        .route(
            "/auth/password/change",
            post(handlers::auth::change_password),
        )
        .route(
            "/admin/dashboard",
            get(handlers::admin::dashboard::get_dashboard),
        )
        .route("/admin/users", get(handlers::admin::users::list))
        .route(
            "/admin/users/:id",
            patch(handlers::admin::users::update).delete(handlers::admin::users::delete),
        )
        .route(
            "/admin/groups/:id/push",
            post(handlers::admin::push::push).delete(handlers::admin::push::unpush),
        )
        .route(
            "/admin/groups/:id/export",
            get(handlers::admin::push::export),
        )
        .route("/admin/groups/import", post(handlers::admin::push::import))
        .route("/admin/audit", get(handlers::admin::audit::list))
        .route(
            "/admin/messages",
            get(handlers::admin::messages::list).post(handlers::admin::messages::create),
        )
        .route(
            "/admin/messages/:id",
            axum::routing::delete(handlers::admin::messages::delete),
        )
        .route(
            "/admin/settings",
            get(handlers::admin::settings::get).patch(handlers::admin::settings::patch),
        )
        .route(
            "/admin/sso",
            get(handlers::admin::sso::get).patch(handlers::admin::sso::patch),
        )
        .route(
            "/admin/icon-libraries",
            get(handlers::admin::icon_libraries::list_libraries)
                .post(handlers::admin::icon_libraries::create_library),
        )
        .route(
            "/admin/icon-libraries/:id",
            axum::routing::delete(handlers::admin::icon_libraries::delete_library),
        )
        .route(
            "/admin/icon-libraries/:id/export",
            get(handlers::admin::icon_libraries::export_library),
        )
        .route(
            "/admin/icon-libraries/import",
            post(handlers::admin::icon_libraries::import_library),
        )
        .route(
            "/admin/icon-libraries/:id/icons",
            post(handlers::admin::icon_libraries::add_icons_to_library),
        )
        .route(
            "/admin/icons",
            get(handlers::admin::icon_libraries::list_icons),
        )
        .route(
            "/admin/icons/:id",
            axum::routing::patch(handlers::admin::icon_libraries::update_icon)
                .delete(handlers::admin::icon_libraries::delete_icon),
        )
        .route(
            "/admin/wallpaper-sources",
            get(handlers::admin::wallpapers::list_sources)
                .post(handlers::admin::wallpapers::create_source),
        )
        .route(
            "/admin/wallpaper-sources/:id",
            patch(handlers::admin::wallpapers::update_source)
                .delete(handlers::admin::wallpapers::delete_source),
        )
        .route(
            "/admin/wallpaper-sources/:id/fetch",
            post(handlers::admin::wallpapers::trigger_fetch),
        )
        .route(
            "/admin/wallpaper-sources/:id/upload",
            post(handlers::admin::wallpapers::upload_wallpaper)
                .layer(DefaultBodyLimit::max(200 * 1024 * 1024)),
        )
        .route(
            "/admin/remote-wallpapers",
            get(handlers::admin::wallpapers::list_wallpapers),
        )
        .route(
            "/admin/remote-wallpapers/:id",
            axum::routing::patch(handlers::admin::wallpapers::update_wallpaper)
                .delete(handlers::admin::wallpapers::delete_wallpaper),
        )
        .route(
            "/admin/icon-asset-sources",
            get(handlers::admin::icon_asset_sources::list_sources)
                .post(handlers::admin::icon_asset_sources::create_source),
        )
        .route(
            "/admin/icon-asset-sources/:id",
            patch(handlers::admin::icon_asset_sources::update_source)
                .delete(handlers::admin::icon_asset_sources::delete_source),
        )
        .route(
            "/admin/icon-asset-sources/:id/fetch",
            post(handlers::admin::icon_asset_sources::trigger_fetch),
        )
        .route(
            "/admin/icon-asset-sources/:id/icons",
            post(handlers::admin::icon_asset_sources::add_manual_icons),
        )
        .route(
            "/admin/remote-icon-assets",
            get(handlers::admin::icon_asset_sources::list_icons),
        )
        .route(
            "/admin/remote-icon-assets/:id",
            axum::routing::delete(handlers::admin::icon_asset_sources::delete_icon),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::require_login,
        ))
        .merge(api_guest);

    let password_login = post(handlers::auth::password).layer(
        axum::middleware::from_fn_with_state(state.clone(), auth::rate_limit::password_login_limit),
    );

    // AUTH-4: the SSO start endpoint is also rate-limited by source IP — it mints
    // Redis oauth_state keys per hit, so an unthrottled flood is its own small DoS
    // and brute-forces the same auth surface. Same per-IP limiter as password.
    let sso_login = get(handlers::auth::login).layer(axum::middleware::from_fn_with_state(
        state.clone(),
        auth::rate_limit::password_login_limit,
    ));

    let public = Router::new()
        .route("/auth/login", sso_login)
        .route("/auth/callback", get(handlers::auth::callback))
        .route("/auth/password", password_login)
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/status", get(handlers::auth::status))
        .route("/api/config/public", get(handlers::auth::public_config));

    let uploads = Router::new().route("/uploads/*path", get(handlers::upload::serve));

    // `Cache-Control: no-store` on every dynamic response so an upstream reverse
    // proxy (we've seen openresty in front of this app) can't accidentally cache
    // `/auth/status` or any per-user `/api/*` response and serve another user's
    // (or a stale logged-in) view to the next requester. `if_not_present` keeps
    // handler-set policies (e.g. `favicon` long-cache, `workspace`'s `private,
    // no-cache`) intact.
    Router::new()
        .merge(public)
        .merge(uploads)
        .nest("/api", api)
        .layer(
            tower_http::set_header::SetResponseHeaderLayer::if_not_present(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-store"),
            ),
        )
}
