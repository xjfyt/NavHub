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
    /// Strict client for public-internet APIs (weather, hot lists, etc.).
    /// Always validates TLS — never weakened by `tls_accept_invalid_certs`.
    pub reqwest_client: reqwest::Client,
    /// Lenient client for backends the operator has wired up themselves: favicon
    /// proxy/search and the OIDC token / userinfo exchange. When
    /// `app.tls_accept_invalid_certs = true` this client skips TLS validation
    /// so homelab self-signed CAs work without bundling them into the image.
    /// The strict `reqwest_client` is unaffected so MITM on third-party APIs
    /// still gets caught.
    pub lenient_client: reqwest::Client,
}

impl AppState {
    pub async fn new(cfg: AppConfig, pg: PgPool, redis: RedisPool) -> anyhow::Result<Self> {
        let sso = SsoCache::load(&pg, &cfg.sso).await?;
        let storage = Storage::from_config(&cfg).await?;

        let reqwest_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .build()?;

        let mut lenient_builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            // Cap redirects so a site can't bounce us through an internal URL.
            .redirect(reqwest::redirect::Policy::limited(3));
        if cfg.app.tls_accept_invalid_certs {
            tracing::warn!(
                "app.tls_accept_invalid_certs=true: favicon + OIDC requests will skip TLS \
                 validation. Public-internet APIs still validate normally."
            );
            lenient_builder = lenient_builder.danger_accept_invalid_certs(true);
        }
        let lenient_client = lenient_builder.build()?;

        Ok(Self {
            cfg,
            pg,
            redis,
            sso: RwLock::new(sso),
            storage,
            reqwest_client,
            lenient_client,
        })
    }
}
