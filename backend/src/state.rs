use crate::{auth::sso_cache::SsoCache, config::AppConfig, storage::Storage};
use deadpool_redis::Pool as RedisPool;
use sqlx::PgPool;
use tokio::sync::RwLock;

pub struct AppState {
    pub cfg: AppConfig,
    pub pg: PgPool,
    pub redis: RedisPool,
    pub sso: RwLock<SsoCache>,
    pub storage: Storage,
    /// Strict client used for trusted external APIs (weather, hot-list, OIDC, etc.).
    /// Always validates TLS — never weakened by `tls_accept_invalid_certs`.
    pub reqwest_client: reqwest::Client,
    /// Lenient client used only for the favicon proxy/search path.
    /// May skip TLS verification when `app.tls_accept_invalid_certs = true` so
    /// homelab self-signed sites can still surface their favicon.
    pub favicon_client: reqwest::Client,
}

impl AppState {
    pub async fn new(cfg: AppConfig, pg: PgPool, redis: RedisPool) -> anyhow::Result<Self> {
        let sso = SsoCache::load(&pg, &cfg.sso).await?;
        let storage = Storage::from_config(&cfg).await?;

        let reqwest_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .build()?;

        let mut favicon_builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            // Cap redirects so a site can't bounce us through an internal URL.
            .redirect(reqwest::redirect::Policy::limited(3));
        if cfg.app.tls_accept_invalid_certs {
            tracing::warn!(
                "app.tls_accept_invalid_certs=true: favicon client will skip TLS validation. \
                 Trusted external APIs (weather/OIDC/etc.) still validate normally."
            );
            favicon_builder = favicon_builder.danger_accept_invalid_certs(true);
        }
        let favicon_client = favicon_builder.build()?;

        Ok(Self {
            cfg,
            pg,
            redis,
            sso: RwLock::new(sso),
            storage,
            reqwest_client,
            favicon_client,
        })
    }
}
