use crate::{auth::sso_cache::SsoCache, config::AppConfig, storage::StorageBackendState};
use deadpool_redis::Pool as RedisPool;
use sqlx::PgPool;
use tokio::sync::RwLock;

pub struct AppState {
    pub cfg: AppConfig,
    pub pg: PgPool,
    pub redis: RedisPool,
    pub sso: RwLock<SsoCache>,
    pub storage: StorageBackendState,
    pub reqwest_client: reqwest::Client,
}

impl AppState {
    pub async fn new(cfg: AppConfig, pg: PgPool, redis: RedisPool) -> anyhow::Result<Self> {
        let sso = SsoCache::load(&pg, &cfg.sso).await?;
        let storage = StorageBackendState::from_config(&cfg).await?;
        
        let reqwest_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .danger_accept_invalid_certs(true)
            .build()?;
            
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
