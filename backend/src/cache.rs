use crate::config::RedisConfig;
use deadpool_redis::{Config, Pool, Runtime};

pub fn connect(cfg: &RedisConfig) -> anyhow::Result<Pool> {
    let redis_cfg = Config::from_url(cfg.url());
    let pool = redis_cfg.create_pool(Some(Runtime::Tokio1))?;
    Ok(pool)
}
