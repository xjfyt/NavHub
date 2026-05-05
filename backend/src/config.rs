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
    /// 首位完成 SSO 登录的用户自动升级为 superadmin
    /// 仅当数据库中尚无 casdoor_id 绑定的用户时生效
    #[serde(default)]
    pub first_sso_bind: bool,
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
    #[serde(default = "default_site_name")]
    pub site_name: String,
    #[serde(default)]
    pub iframe_whitelist: Vec<String>,
    /// 允许 reqwest 接受非法 TLS 证书(自签名、过期、域名不匹配)。
    /// 默认 false。仅在受控内网调试自签 CA 时手动开启,生产环境切勿开启。
    #[serde(default)]
    pub tls_accept_invalid_certs: bool,
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
