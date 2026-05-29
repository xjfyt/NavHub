use crate::{
    auth::oidc::JwksCache,
    auth::sso_cache::{CachedSso, SsoCache, SSO_CACHE_TTL},
    config::AppConfig,
    storage::Storage,
};
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
    /// OPS-11: 进程内 SSO 配置缓存,带加载时刻 + 短 TTL(见 SSO_CACHE_TTL)。多副本下
    /// 某副本经 /admin/sso 改配后,其它副本最迟在一个 TTL 窗口内重载并感知变更。
    /// 读取统一走 `current_sso()`,陈旧时自动从 app_settings 重载。
    pub sso: RwLock<CachedSso>,
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
        let sso = CachedSso::new(SsoCache::load(&pg, &cfg.sso).await?);
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

    /// OPS-11: 返回当前有效的 SSO 配置。若进程内缓存已超过 TTL(见 SSO_CACHE_TTL),
    /// 先从 app_settings 重载再返回,使其它副本的改动在一个窗口内传播到本副本。
    ///
    /// 重载失败(DB 瞬时不可用)时,记录告警并返回现有缓存(fail-open),避免一次 DB
    /// 抖动就打断登录/回调等鉴权路径。重载成功则刷新缓存与 loaded_at。
    pub async fn current_sso(&self) -> SsoCache {
        // 快路径:持读锁判断是否陈旧;未陈旧直接返回克隆。
        {
            let guard = self.sso.read().await;
            if !guard.is_stale_at(std::time::Instant::now(), SSO_CACHE_TTL) {
                return guard.value.clone();
            }
        }
        // 慢路径:陈旧——尝试重载。重载在锁外进行,避免持写锁打 DB 阻塞其它读者。
        match SsoCache::load(&self.pg, &self.cfg.sso).await {
            Ok(fresh) => {
                let mut guard = self.sso.write().await;
                // 双重检查:可能已有并发请求刚刚刷新过,避免重复写。
                if guard.is_stale_at(std::time::Instant::now(), SSO_CACHE_TTL) {
                    *guard = CachedSso::new(fresh);
                }
                guard.value.clone()
            }
            Err(e) => {
                tracing::warn!("OPS-11: reloading SSO cache failed, serving stale: {e}");
                self.sso.read().await.value.clone()
            }
        }
    }

    /// OPS-11: 超管经 /admin/sso 改配后立即写回本副本缓存并重置 loaded_at(其它副本靠
    /// TTL 重载感知)。调用方负责先持久化到 app_settings。
    pub async fn set_sso(&self, value: SsoCache) {
        *self.sso.write().await = CachedSso::new(value);
    }
}
