use crate::{auth::oidc::JwksCache, auth::sso_cache::SsoCache, config::AppConfig, storage::Storage};
use deadpool_redis::Pool as RedisPool;
use sqlx::PgPool;
use std::sync::Arc;
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
        })
    }
}
