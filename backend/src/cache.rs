use crate::config::RedisConfig;
use deadpool_redis::{Config, Pool, PoolConfig, Runtime, Timeouts};
use std::time::Duration;

/// INFRA-11/DATA-10: deadpool-redis 默认连接池既无显式上限,也无获取/创建超时——
/// Redis 宕机或慢响应时,请求会无限期等待一个永远拿不到的连接,拖垮整个 worker。
/// 这里显式设定池大小上限,并为 wait(从池中取连接)与 create(新建连接)设定超时,
/// 使 Redis 故障时请求快速失败(返回错误)而非挂死。
const REDIS_POOL_MAX_SIZE: usize = 32;
const REDIS_WAIT_TIMEOUT: Duration = Duration::from_secs(3);
const REDIS_CREATE_TIMEOUT: Duration = Duration::from_secs(3);

pub fn connect(cfg: &RedisConfig) -> anyhow::Result<Pool> {
    let mut redis_cfg = Config::from_url(cfg.url());
    redis_cfg.pool = Some(PoolConfig {
        max_size: REDIS_POOL_MAX_SIZE,
        timeouts: Timeouts {
            wait: Some(REDIS_WAIT_TIMEOUT),
            create: Some(REDIS_CREATE_TIMEOUT),
            recycle: None,
        },
        ..Default::default()
    });
    let pool = redis_cfg.create_pool(Some(Runtime::Tokio1))?;
    Ok(pool)
}
