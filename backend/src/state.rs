use crate::{auth::oidc::JwksCache, auth::sso_cache::SsoCache, config::AppConfig, storage::Storage};
use deadpool_redis::Pool as RedisPool;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify, RwLock, Semaphore};
use tokio_util::task::TaskTracker;

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
    /// AUTH-1: TLS-validating client dedicated to the OIDC security path —
    /// token exchange, JWKS fetch and userinfo. Unlike `lenient_client` this is
    /// NEVER weakened by `tls_accept_invalid_certs`: accepting an invalid cert
    /// here would let a MITM forge the ID-token signing keys / token response
    /// and defeat the whole verification. Redirects are disabled (same SSRF
    /// reasoning as the lenient client).
    pub oidc_client: reqwest::Client,
    /// AUTH-1: short-TTL in-memory cache of the provider JWKS, keyed implicitly
    /// by the configured jwks_uri. Refetched on miss / expiry / unknown-kid.
    pub jwks_cache: Arc<JwksCache>,
    /// INFRA-6: 进程内 favicon 单飞(single-flight)注册表。键为 favicon 缓存键,
    /// 值为该键当前正在进行的上游抓取所对应的 Notify。缓存击穿时(大量并发请求
    /// 同一 host)只让第一个请求真正去抓上游,其余等待其完成后复用缓存结果,
    /// 避免缓存击穿风暴。Redis 不可用时整体失败开放(各自正常抓取),不会挂起。
    pub favicon_inflight: Mutex<HashMap<String, Arc<Notify>>>,
    /// INFRA-4: 跟踪 admin 手动触发的后台抓取任务,优雅关停时排空进行中的工作。
    pub bg_tasks: TaskTracker,
    /// INFRA-4: 限制 admin 手动触发抓取的最大并发数(由 admin_fetch_max_concurrency
    /// 配置),避免反复点击堆出无界并发。
    pub admin_fetch_sem: Arc<Semaphore>,
}

impl AppState {
    pub async fn new(cfg: AppConfig, pg: PgPool, redis: RedisPool) -> anyhow::Result<Self> {
        let sso = SsoCache::load(&pg, &cfg.sso).await?;
        let storage = Storage::from_config(&cfg).await?;

        // INFRA-4: 限流许可数取配置值,至少 1,避免配 0 导致任务永远拿不到许可。
        let admin_fetch_sem = Arc::new(Semaphore::new(cfg.app.admin_fetch_max_concurrency.max(1)));

        let reqwest_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .build()?;

        let mut lenient_builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            // SEC-4: 不自动跟随重定向。reqwest 不会对重定向目标重跑我们的 SSRF 校验,
            // 因此一个通过校验的公网域可 302 跳到内网/云元数据。改为不跟随重定向,
            // 由调用方对每个显式 URL 的主机各自校验(favicon/OIDC 端点均不依赖重定向)。
            .redirect(reqwest::redirect::Policy::none());
        if cfg.app.tls_accept_invalid_certs {
            tracing::warn!(
                "app.tls_accept_invalid_certs=true: favicon + OIDC requests will skip TLS \
                 validation. Public-internet APIs still validate normally."
            );
            lenient_builder = lenient_builder.danger_accept_invalid_certs(true);
        }
        let lenient_client = lenient_builder.build()?;

        // AUTH-1: dedicated OIDC client — always TLS-validating, redirects off.
        // Built independently of `tls_accept_invalid_certs` so the security path
        // can never be downgraded by that homelab convenience flag.
        let oidc_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;

        Ok(Self {
            cfg,
            pg,
            redis,
            sso: RwLock::new(sso),
            storage,
            reqwest_client,
            lenient_client,
            oidc_client,
            jwks_cache: Arc::new(JwksCache::new()),
            favicon_inflight: Mutex::new(HashMap::new()),
            bg_tasks: TaskTracker::new(),
            admin_fetch_sem,
        })
    }
}
