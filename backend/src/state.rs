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
    pub reqwest_client: reqwest::Client,
}

impl AppState {
    pub async fn new(cfg: AppConfig, pg: PgPool, redis: RedisPool) -> anyhow::Result<Self> {
        let sso = SsoCache::load(&pg, &cfg.sso).await?;
        let storage = Storage::from_config(&cfg).await?;
        
        let mut builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16);
        if cfg.app.tls_accept_invalid_certs {
            tracing::warn!(
                "app.tls_accept_invalid_certs=true: HTTPS certificate validation is DISABLED. \
                 Do NOT use this in production."
            );
            builder = builder.danger_accept_invalid_certs(true);
        }
        let reqwest_client = builder.build()?;
            
        Ok(Self {
            cfg,
            pg,
            redis,
            sso: RwLock::new(sso),
            storage,
            reqwest_client,
        })
    }
}
