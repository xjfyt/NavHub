mod auth;
mod cache;
mod config;
mod db;
mod error;
mod handlers;
mod models;
mod routes;
mod scraper;
mod state;
mod storage;
mod tasks;

use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::sync::Notify;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let cfg = config::AppConfig::load()?;

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&cfg.app.log_level));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    tracing::info!("starting navhub on {}:{}", cfg.server.host, cfg.server.port);

    // AUTH-6: fail loud when the public origin is plain http on a *public* host.
    // We intentionally keep cookie `Secure` tied to https (so pure-http LAN/homelab
    // deployments keep working) — but a public http origin means the session
    // cookie is sent without `Secure` and can be intercepted, defeating SSO/auth.
    if auth::session::public_url_is_insecure_public(&cfg.server.public_url) {
        tracing::warn!(
            public_url = %cfg.server.public_url,
            "INSECURE: public_url is a public http:// origin — session cookies will be \
             sent WITHOUT the Secure flag and can be intercepted in transit, making SSO \
             and password auth insecure. Set an https:// public_url (terminate TLS at a \
             reverse proxy) before exposing this instance to the internet."
        );
    }

    let pg = db::connect(&cfg.database).await?;
    let redis = cache::connect(&cfg.redis)?;

    let state = Arc::new(AppState::new(cfg.clone(), pg, redis).await?);
    auth::bootstrap_superadmin(&state).await?;

    let app = routes::build(&state);
    let app = with_frontend(app, &state);
    let app = with_global_layers(app, &state);
    let app = app.with_state(state.clone());

    // Background workers — owned by `BackgroundHandles` so we can drain them on shutdown.
    let workers = tasks::BackgroundHandles::spawn_all(state.clone());
    let shutdown_notify = Arc::new(Notify::new());
    let notify_for_signal = shutdown_notify.clone();
    tokio::spawn(async move {
        shutdown_signal().await;
        notify_for_signal.notify_waiters();
    });

    let addr: SocketAddr =
        format!("{}:{}", state.cfg.server.host, state.cfg.server.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{}", addr);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move { shutdown_notify.notified().await })
    .await?;

    // Drain workers (bounded so a stuck task can't keep the process alive).
    workers.shutdown(Duration::from_secs(10)).await;
    Ok(())
}

fn with_frontend(mut app: Router<Arc<AppState>>, state: &Arc<AppState>) -> Router<Arc<AppState>> {
    let dist_dir = &state.cfg.frontend.dist_dir;
    let dev_assets = std::env::var("NAVHUB_DEV").ok().as_deref() == Some("1");

    if !dist_dir.exists() {
        tracing::warn!("frontend dist not found at {}", dist_dir.display());
        return app.fallback(get(|| async { "frontend not found at specified dist_dir" }));
    }

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
    app
}

fn with_global_layers(
    app: Router<Arc<AppState>>,
    state: &Arc<AppState>,
) -> Router<Arc<AppState>> {
    let mut cors_origins = vec![
        "http://localhost:5173".parse().unwrap(),
        "http://127.0.0.1:5173".parse().unwrap(),
    ];
    if let Ok(u) = state.cfg.server.public_url.trim_end_matches('/').parse() {
        cors_origins.push(u);
    }

    app.layer(CompressionLayer::new().br(true).gzip(true).zstd(true))
        .layer(TraceLayer::new_for_http())
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            header::HeaderValue::from_static("nosniff"),
        ))
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
        .layer(axum::middleware::from_fn(
            auth::middleware::inject_request_id,
        ))
}

pub async fn healthz() -> &'static str {
    "OK"
}

pub async fn readyz(State(state): State<Arc<AppState>>) -> StatusCode {
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
