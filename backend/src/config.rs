use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub superadmin: SuperadminConfig,
    pub sso: SsoConfig,
    pub app: GeneralConfig,
    #[serde(default)]
    pub storage: StorageConfig,
    #[serde(default)]
    #[allow(dead_code)]
    pub weather: WeatherConfig,
    pub frontend: FrontendConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub public_url: String,
    /// AUTH-4: 受信任的反向代理 IP / CIDR 列表。仅当请求的直连对端(socket peer)
    /// 命中本列表时,才信任 X-Forwarded-For 头来确定真实客户端 IP;否则一律使用
    /// socket peer 地址,避免攻击者伪造 XFF 绕过登录限流。默认空列表 = 不信任 XFF。
    /// 支持单个 IP(如 "10.0.0.1")或 CIDR(如 "10.0.0.0/8"、"fd00::/8")。
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    #[serde(default = "default_pg_max")]
    pub max_connections: u32,
}

fn default_pg_max() -> u32 {
    10
}

impl DatabaseConfig {
    pub fn dsn(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            urlencoding::encode(&self.database),
        )
    }

    /// DSN targeting the default "postgres" DB so we can CREATE DATABASE if needed
    pub fn admin_dsn(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/postgres",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
        )
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub db: u8,
}

impl RedisConfig {
    pub fn url(&self) -> String {
        if self.password.is_empty() {
            format!("redis://{}:{}/{}", self.host, self.port, self.db)
        } else {
            format!(
                "redis://:{}@{}:{}/{}",
                urlencoding::encode(&self.password),
                self.host,
                self.port,
                self.db
            )
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SuperadminConfig {
    pub username: String,
    pub password: String,
    pub email: String,
    #[serde(default = "default_super_display")]
    pub display_name: String,
    /// 允许超管用账号密码登录;关闭后 /auth/password 返回 403,前端隐藏密码 Tab
    #[serde(default = "default_true")]
    pub password_login_enabled: bool,
    /// 首位完成 SSO 登录的用户自动升级为 superadmin。
    /// 仅当数据库中尚无 superadmin 时生效。
    ///
    /// 安全风险(AUTH-3):若开启且 allowlist 为空,则任意第一个完成 SSO 登录的人
    /// (包括攻击者抢先登录)都会被授予 superadmin。默认关闭(false)。
    /// 即便开启,也强烈建议同时配置 first_sso_bind_allowlist 限定可被提权的身份。
    #[serde(default)]
    pub first_sso_bind: bool,
    /// AUTH-3: 仅当新建 SSO 用户的 email 或 subject 命中本列表时,才允许 first_sso_bind
    /// 提权。空列表(默认)表示不额外限制——此时 first_sso_bind 必须显式开启且“首位即提权”
    /// 的风险由运维自行承担;非空时即使 first_sso_bind 为 true 也只放行白名单内的身份。
    #[serde(default)]
    pub first_sso_bind_allowlist: Vec<String>,
    /// 是否要求 superadmin 在首次登录时强制修改密码
    #[serde(default = "default_true")]
    pub force_change_password: bool,
}

fn default_super_display() -> String {
    "Super Admin".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    #[serde(default = "default_scopes")]
    pub scopes: Vec<String>,
    /// AUTH-1: explicit JWKS endpoint for verifying ID-token signatures. Empty
    /// (default) derives it from the issuer as Casdoor's `<issuer>/.well-known/jwks`,
    /// so existing configs keep working. Override only for providers whose JWKS
    /// path differs.
    #[serde(default)]
    pub jwks_uri: String,
}

fn default_true() -> bool {
    true
}

fn default_scopes() -> Vec<String> {
    vec!["openid".into(), "profile".into(), "email".into()]
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct GeneralConfig {
    #[serde(default = "default_retention")]
    pub audit_retention_days: i64,
    #[serde(default = "default_session_ttl")]
    pub session_ttl_days: i64,
    #[serde(default = "default_upload_max")]
    pub upload_max_mb: u64,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    /// OPS-5: 日志输出格式。`"pretty"`(默认,人类可读,保持原有行为)或 `"json"`
    /// (结构化,便于生产环境采集到 Loki/ELK 等)。可被环境变量 `NAVHUB_LOG_FORMAT`
    /// 覆盖。未知值回退为 pretty。
    #[serde(default = "default_log_format")]
    pub log_format: String,
    #[serde(default = "default_site_name")]
    pub site_name: String,
    #[serde(default)]
    pub iframe_whitelist: Vec<String>,
    /// 允许 reqwest 接受非法 TLS 证书(自签名、过期、域名不匹配)。
    /// 默认 false。仅在受控内网调试自签 CA 时手动开启,生产环境切勿开启。
    #[serde(default)]
    pub tls_accept_invalid_certs: bool,
    /// 是否允许 favicon 代理/搜索访问私有/内网 IP(RFC1918 等)。默认 false。
    /// SEC-5: 与 tls_accept_invalid_certs 解耦——TLS 校验开关不应再兼任 SSRF 白名单。
    /// 注意:link-local(169.254/16,含云元数据)始终被拒绝,不受此开关影响。
    #[serde(default)]
    pub favicon_allow_private_targets: bool,
    /// INFRA-4: admin 手动触发的壁纸/图标后台抓取任务的最大并发数。这些任务此前是
    /// 裸 tokio::spawn 脱管:既不限流(可被反复点击堆出无界并发),也不在优雅关停时
    /// 被等待(进行中的工作丢失)。改为共享 Semaphore 限流 + TaskTracker 跟踪后,
    /// 本值控制同时运行的抓取任务上限。默认 2。
    #[serde(default = "default_admin_fetch_concurrency")]
    pub admin_fetch_max_concurrency: usize,
    /// OPS-10: 是否在 `/readyz` 就绪探测中加入一次浅层 S3 可达性检查(HeadBucket)。
    /// 默认 false——对象存储可能慢/可选,且 readyz 须快速返回不能挂起。开启后,探测
    /// 由 readyz_storage_timeout_ms 短超时兜底;超时或失败都判为未就绪。
    #[serde(default)]
    pub readyz_check_storage: bool,
    /// OPS-10: 上面 S3 就绪探测的超时(毫秒)。默认 2000ms。下限 100ms,避免配 0
    /// 让探测必然超时。仅在 readyz_check_storage=true 时生效。
    #[serde(default = "default_readyz_storage_timeout_ms")]
    pub readyz_storage_timeout_ms: u64,
}

fn default_readyz_storage_timeout_ms() -> u64 {
    2000
}

fn default_admin_fetch_concurrency() -> usize {
    2
}

fn default_retention() -> i64 {
    90
}
fn default_session_ttl() -> i64 {
    7
}
fn default_upload_max() -> u64 {
    2
}
fn default_log_level() -> String {
    "info".into()
}
fn default_log_format() -> String {
    "pretty".into()
}

/// OPS-5: 日志格式枚举。`tracing_subscriber` 的 pretty / json 两种 formatter 的开关。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Pretty,
    Json,
}

/// OPS-5(纯函数,便于单元测试):决定最终使用哪种日志格式。
///
/// 优先级:环境变量 `NAVHUB_LOG_FORMAT` > 配置文件 `app.log_format`。
/// 取值大小写不敏感,两侧空白被裁剪;`"json"` 选 JSON,其余一切(含未知值、
/// 空字符串)回退为 `Pretty`,保持升级前的人类可读默认行为。
pub fn resolve_log_format(config_value: &str, env_value: Option<&str>) -> LogFormat {
    // 环境变量存在且非空白时优先;否则用配置值。
    let chosen = match env_value {
        Some(v) if !v.trim().is_empty() => v,
        _ => config_value,
    };
    match chosen.trim().to_ascii_lowercase().as_str() {
        "json" => LogFormat::Json,
        _ => LogFormat::Pretty,
    }
}
fn default_site_name() -> String {
    "NavHub".into()
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct StorageConfig {
    #[serde(default)]
    pub s3: S3StorageConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct S3StorageConfig {
    #[serde(default)]
    pub endpoint: String,
    #[serde(default = "default_s3_region")]
    pub region: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default)]
    pub access_key: String,
    #[serde(default)]
    pub secret_key: String,
    #[serde(default = "default_s3_path_style")]
    pub path_style: bool,
    #[serde(default = "default_s3_key_prefix")]
    pub key_prefix: String,
    #[serde(default = "default_s3_presign_ttl_secs")]
    pub presign_ttl_secs: u64,
}

impl Default for S3StorageConfig {
    fn default() -> Self {
        Self {
            endpoint: String::new(),
            region: default_s3_region(),
            bucket: String::new(),
            access_key: String::new(),
            secret_key: String::new(),
            path_style: default_s3_path_style(),
            key_prefix: default_s3_key_prefix(),
            presign_ttl_secs: default_s3_presign_ttl_secs(),
        }
    }
}

fn default_s3_region() -> String {
    "us-east-1".into()
}

fn default_s3_path_style() -> bool {
    true
}

fn default_s3_key_prefix() -> String {
    "assets".into()
}

fn default_s3_presign_ttl_secs() -> u64 {
    3600
}

#[derive(Debug, Clone, Deserialize, Default)]
#[allow(dead_code)]
pub struct WeatherConfig {
    #[serde(default)]
    pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FrontendConfig {
    #[serde(default = "default_dist_dir")]
    pub dist_dir: PathBuf,
}

fn default_dist_dir() -> PathBuf {
    PathBuf::from("./frontend/dist")
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        let path = resolve_config_path();
        let path_str = path.to_string_lossy().to_string();
        tracing::debug!("loading config from {path_str}");
        let builder = config::Config::builder()
            .add_source(config::File::with_name(&path_str).required(true))
            .add_source(
                config::Environment::with_prefix("NAVHUB")
                    .separator("__")
                    .list_separator(","),
            );
        let mut cfg: AppConfig = builder
            .build()
            .map_err(|e| anyhow::anyhow!("config load ({path_str}): {e}"))?
            .try_deserialize()
            .map_err(|e| anyhow::anyhow!("config parse ({path_str}): {e}"))?;

        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                if cfg.frontend.dist_dir.is_relative() {
                    cfg.frontend.dist_dir = parent.join(&cfg.frontend.dist_dir);
                }
            }
        }

        Ok(cfg)
    }
}

/// Resolve config.toml by checking `$NAVHUB_CONFIG`, then CWD, then the workspace parent.
/// This lets `cargo run` from `backend/` still find `../config.toml`.
fn resolve_config_path() -> PathBuf {
    if let Ok(env_path) = std::env::var("NAVHUB_CONFIG") {
        return PathBuf::from(env_path);
    }
    for cand in [
        PathBuf::from("config.toml"),
        PathBuf::from("../config.toml"),
    ] {
        if cand.exists() {
            return cand;
        }
    }
    PathBuf::from("config.toml")
}

#[cfg(test)]
mod tests {
    use super::{resolve_log_format, LogFormat};

    #[test]
    fn config_pretty_is_default() {
        // 配置为 pretty、无环境变量 → Pretty。
        assert_eq!(resolve_log_format("pretty", None), LogFormat::Pretty);
    }

    #[test]
    fn config_json_selected() {
        assert_eq!(resolve_log_format("json", None), LogFormat::Json);
    }

    #[test]
    fn unknown_or_empty_config_falls_back_to_pretty() {
        // 未知值与空串都回退到 pretty,保持升级前默认行为。
        assert_eq!(resolve_log_format("verbose", None), LogFormat::Pretty);
        assert_eq!(resolve_log_format("", None), LogFormat::Pretty);
    }

    #[test]
    fn env_overrides_config() {
        // 环境变量优先于配置文件。
        assert_eq!(
            resolve_log_format("pretty", Some("json")),
            LogFormat::Json
        );
        assert_eq!(
            resolve_log_format("json", Some("pretty")),
            LogFormat::Pretty
        );
    }

    #[test]
    fn blank_env_is_ignored_and_config_wins() {
        // 空白/空环境变量视为未设置,回落到配置值。
        assert_eq!(resolve_log_format("json", Some("")), LogFormat::Json);
        assert_eq!(resolve_log_format("json", Some("   ")), LogFormat::Json);
    }

    #[test]
    fn matching_is_case_and_whitespace_insensitive() {
        assert_eq!(resolve_log_format("  JSON  ", None), LogFormat::Json);
        assert_eq!(resolve_log_format("Pretty", Some("  Json ")), LogFormat::Json);
    }
}
