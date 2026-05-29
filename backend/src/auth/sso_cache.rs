use crate::config::SsoConfig;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::time::{Duration, Instant};

/// OPS-11: 内存 SSO 缓存的存活时长。SSO 配置缓存在每个副本的进程内,在某副本更新后,
/// 其它副本不会立刻感知。给缓存加一个短 TTL,使配置变更最迟在一个窗口内于全副本生效。
/// 30s 在「变更传播延迟」与「每次鉴权都打 DB」之间取平衡。比 Redis pub/sub 失效简单
/// 得多,且对 SSO 配置这种低频变更已足够。
pub const SSO_CACHE_TTL: Duration = Duration::from_secs(30);

/// OPS-11: 带加载时刻的内存 SSO 缓存。超过 TTL 即视为陈旧,触发从 app_settings 重载。
#[derive(Debug, Clone)]
pub struct CachedSso {
    pub value: SsoCache,
    pub loaded_at: Instant,
}

impl CachedSso {
    pub fn new(value: SsoCache) -> Self {
        Self {
            value,
            loaded_at: Instant::now(),
        }
    }

    /// 缓存是否已陈旧(自 loaded_at 起经过的时间是否达到/超过 ttl)。纯逻辑,便于单测。
    pub fn is_stale_at(&self, now: Instant, ttl: Duration) -> bool {
        sso_cache_is_stale(self.loaded_at, now, ttl)
    }
}

/// OPS-11(纯函数,便于单测):距离上次加载是否已达 TTL。`now` 早于 `loaded_at`
/// (时钟/调度边界)时视为未陈旧。
pub fn sso_cache_is_stale(loaded_at: Instant, now: Instant, ttl: Duration) -> bool {
    now.saturating_duration_since(loaded_at) >= ttl
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoCache {
    pub enabled: bool,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    /// AUTH-1: optional explicit JWKS endpoint. Empty derives from issuer.
    /// `#[serde(default)]` keeps older persisted `app_settings.sso` rows (which
    /// predate this field) deserializable.
    #[serde(default)]
    pub jwks_uri: String,
}

impl SsoCache {
    pub async fn load(pg: &PgPool, default: &SsoConfig) -> anyhow::Result<Self> {
        let row: Option<(serde_json::Value,)> =
            sqlx::query_as("SELECT value FROM app_settings WHERE key = 'sso'")
                .fetch_optional(pg)
                .await?;
        if let Some((v,)) = row {
            if let Ok(parsed) = serde_json::from_value::<SsoCache>(v) {
                return Ok(parsed);
            }
        }
        Ok(Self::from_default(default))
    }

    pub fn from_default(default: &SsoConfig) -> Self {
        Self {
            enabled: default.enabled,
            issuer: default.issuer.clone(),
            client_id: default.client_id.clone(),
            client_secret: default.client_secret.clone(),
            redirect_uri: default.redirect_uri.clone(),
            scopes: default.scopes.clone(),
            jwks_uri: default.jwks_uri.clone(),
        }
    }

    /// AUTH-1: the effective JWKS endpoint — explicit config when set, otherwise
    /// derived from the issuer (`<issuer>/.well-known/jwks` for Casdoor).
    pub fn jwks_uri(&self) -> String {
        crate::auth::oidc::derive_jwks_uri(&self.issuer, &self.jwks_uri)
    }

    pub async fn save(&self, pg: &PgPool) -> anyhow::Result<()> {
        let v = serde_json::to_value(self)?;
        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ('sso', $1, now()) \
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
        )
        .bind(v)
        .execute(pg)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // OPS-11: TTL 陈旧判定。
    #[test]
    fn not_stale_before_ttl() {
        let loaded = Instant::now();
        let now = loaded + Duration::from_secs(10);
        assert!(!sso_cache_is_stale(loaded, now, Duration::from_secs(30)));
    }

    #[test]
    fn stale_at_exactly_ttl() {
        let loaded = Instant::now();
        let now = loaded + Duration::from_secs(30);
        assert!(sso_cache_is_stale(loaded, now, Duration::from_secs(30)));
    }

    #[test]
    fn stale_past_ttl() {
        let loaded = Instant::now();
        let now = loaded + Duration::from_secs(31);
        assert!(sso_cache_is_stale(loaded, now, Duration::from_secs(30)));
    }

    #[test]
    fn now_before_loaded_is_not_stale() {
        // 时钟/调度边界:now 早于 loaded_at 时,saturating 归零,视为未陈旧。
        let loaded = Instant::now() + Duration::from_secs(5);
        let now = Instant::now();
        assert!(!sso_cache_is_stale(loaded, now, Duration::from_secs(30)));
    }

    #[test]
    fn cached_sso_is_stale_at_delegates() {
        let c = CachedSso::new(SsoCache {
            enabled: false,
            issuer: String::new(),
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: String::new(),
            scopes: vec![],
            jwks_uri: String::new(),
        });
        assert!(!c.is_stale_at(c.loaded_at, SSO_CACHE_TTL));
        assert!(c.is_stale_at(c.loaded_at + SSO_CACHE_TTL, SSO_CACHE_TTL));
    }
}
