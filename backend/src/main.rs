mod auth;
mod cache;
mod config;
mod db;
mod error;
mod handlers;
mod models;
mod scraper;
mod state;
mod storage;

use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Router,
};
use std::{net::SocketAddr, sync::Arc};
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

use crate::{config::StorageBackend, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let cfg = config::AppConfig::load()?;

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&cfg.app.log_level));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    tracing::info!("starting navhub on {}:{}", cfg.server.host, cfg.server.port);

    let pg = db::connect(&cfg.database).await?;
    let redis = cache::connect(&cfg.redis)?;

    let state = Arc::new(AppState::new(cfg.clone(), pg, redis).await?);
    auth::bootstrap_superadmin(&state).await?;

    // 游客也能访问的 API:workspace(空会话返回已推送分类)
    let api_guest = Router::new()
        .route("/workspace", get(handlers::workspace::get_workspace))
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::optional_login,
        ));

    let api = Router::new()
        .route("/me", get(handlers::me::get_me).patch(handlers::me::patch_me))
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
        .route("/groups/:id/reorder-items", post(handlers::groups::reorder_items))

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
        .route("/favicon", get(handlers::favicon::proxy))
        .route("/widgets/weather", get(handlers::widgets::weather))
        .route("/widgets/hot", get(handlers::widgets::hot))

        .route("/widgets/music/search", get(handlers::music::search))
        .route("/widgets/music/song/:id", get(handlers::music::song))
        .route("/auth/password/change", post(handlers::auth::change_password))

        // Wallpapers (public list for all logged-in users)
        .route("/wallpapers", get(handlers::wallpapers::list_wallpapers))

        // Admin
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
        .route("/admin/groups/:id/export", get(handlers::admin::push::export))
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
            axum::routing::delete(handlers::admin::icon_libraries::delete_icon),
        )
        // Wallpaper sources & remote wallpapers admin
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
            "/admin/remote-wallpapers",
            get(handlers::admin::wallpapers::list_wallpapers),
        )
        .route(
            "/admin/remote-wallpapers/:id",
            axum::routing::delete(handlers::admin::wallpapers::delete_wallpaper),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::require_login,
        ))
        .merge(api_guest);

    let public = Router::new()
        .route("/auth/login", get(handlers::auth::login))
        .route("/auth/callback", get(handlers::auth::callback))
        .route("/auth/password", post(handlers::auth::password))
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/status", get(handlers::auth::status))
        .route("/api/config/public", get(handlers::auth::public_config));

    let uploads = match state.storage.backend() {
        StorageBackend::Local => {
            Router::new().nest_service("/uploads", ServeDir::new(&state.cfg.app.uploads_dir))
        }
        StorageBackend::S3 => Router::new().route("/uploads/*path", get(handlers::upload::serve)),
    };

    let mut app = Router::new().merge(public).merge(uploads).nest("/api", api);

    let dist_dir = &state.cfg.frontend.dist_dir;
    let dev_assets = std::env::var("NAVHUB_DEV").ok().as_deref() == Some("1");

    if dist_dir.exists() {
        tracing::info!("serving frontend from {}", dist_dir.display());
        let index_path = dist_dir.join("index.html");

        let assets_dir = dist_dir.join("assets");
        let assets_cache_control = if dev_assets {
            header::HeaderValue::from_static("no-cache")
        } else {
            header::HeaderValue::from_static("public, max-age=31536000, immutable")
        };
        let assets_router = Router::new()
            .nest_service("/assets", ServeDir::new(&assets_dir))
            .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                assets_cache_control,
            ));

        let root_serve = tower::ServiceBuilder::new()
            .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("no-cache"),
            ))
            .service(ServeDir::new(dist_dir).fallback(tower::service_fn(
                move |_req: axum::http::Request<axum::body::Body>| {
                    let index_path = index_path.clone();
                    async move {
                        let index = tokio::fs::read(&index_path).await.unwrap_or_default();
                        let resp: Response =
                            ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], index)
                                .into_response();
                        Ok::<_, std::convert::Infallible>(resp)
                    }
                },
            )));

        app = app.merge(assets_router).fallback_service(root_serve);
    } else {
        tracing::warn!(
            "frontend dist not found at {}",
            dist_dir.display()
        );
        app = app.fallback(get(|| async {
            "frontend not found at specified dist_dir"
        }));
    }

    let mut cors_origins = vec![
        "http://localhost:5173".parse().unwrap(),
        "http://127.0.0.1:5173".parse().unwrap(),
    ];
    if let Ok(u) = state.cfg.server.public_url.trim_end_matches('/').parse() {
        cors_origins.push(u);
    }
    
    let app = app
        .layer(CompressionLayer::new().br(true).gzip(true).zstd(true))
        .layer(TraceLayer::new_for_http())
        .layer(
            tower_http::set_header::SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                header::HeaderValue::from_static("nosniff"),
            )
        )
        .layer(
            CorsLayer::new()
                .allow_origin(cors_origins)
                .allow_credentials(true)
                .allow_methods(vec![
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PUT,
                    axum::http::Method::PATCH,
                    axum::http::Method::DELETE,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers(vec![
                    header::AUTHORIZATION,
                    header::ACCEPT,
                    header::CONTENT_TYPE,
                ]),
        )
        .layer(axum::middleware::from_fn(auth::middleware::inject_request_id))
        .with_state(state.clone());

    let state_audit = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400));
        loop {
            interval.tick().await;
            tracing::info!("running audit log cleanup...");
            let res = sqlx::query("DELETE FROM audit_log WHERE ts < now() - interval '180 days'")
                .execute(&state_audit.pg)
                .await;
            if let Err(e) = res {
                tracing::warn!("audit log cleanup failed: {e}");
            }
        }
    });

    // Wallpaper fetch background task — runs every hour, picks sources due for refresh
    let state_wp = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            tracing::info!("checking wallpaper sources for scheduled fetch...");
            let sources: Result<Vec<crate::models::WallpaperSource>, _> = sqlx::query_as(
                "SELECT * FROM wallpaper_sources WHERE enabled = true
                 AND (last_fetched_at IS NULL OR last_fetched_at < now() - (fetch_interval_hours || ' hours')::interval)",
            )
            .fetch_all(&state_wp.pg)
            .await;
            match sources {
                Ok(srcs) => {
                    for src in srcs {
                        tracing::info!("scheduled fetch for source '{}'", src.name);
                        let s = state_wp.clone();
                        tokio::spawn(async move {
                            if let Err(e) = crate::handlers::admin::wallpapers::run_fetch(&s, &src).await {
                                tracing::error!("wallpaper fetch error '{}': {e}", src.name);
                            }
                        });
                    }
                }
                Err(e) => tracing::warn!("wallpaper source query failed: {e}"),
            }
            // Clean up expired wallpapers
            let _ = sqlx::query(
                "DELETE FROM remote_wallpapers WHERE expires_at IS NOT NULL AND expires_at < now()",
            )
            .execute(&state_wp.pg)
            .await;
        }
    });

    let state_links = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400 * 7)); // checks weekly
        let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().unwrap_or_default();
        loop {
            interval.tick().await;
            tracing::info!("running broken image link check...");
            let paths: Result<Vec<(uuid::Uuid, String)>, _> = sqlx::query_as("SELECT id, image_url FROM icons WHERE image_url IS NOT NULL")
                .fetch_all(&state_links.pg)
                .await;
            if let Ok(paths) = paths {
                for (id, url) in paths {
                    if url.starts_with("http") {
                        if let Err(e) = client.head(&url).send().await {
                            tracing::warn!("broken external link for icon {id}: {url} - {e}");
                        }
                    }
                }
            }
        }
    });

    let addr: SocketAddr =
        format!("{}:{}", state.cfg.server.host, state.cfg.server.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{}", addr);
    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;
    Ok(())
}

async fn healthz() -> &'static str {
    "OK"
}

async fn readyz(State(state): State<Arc<AppState>>) -> StatusCode {
    let pg_ok = state.pg.acquire().await.is_ok();
    let redis_ok = state.redis.get().await.is_ok();
    if pg_ok && redis_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("shutdown signal received: ctrl-c");
        },
        _ = terminate => {
            tracing::info!("shutdown signal received: terminate");
        },
    }
}
