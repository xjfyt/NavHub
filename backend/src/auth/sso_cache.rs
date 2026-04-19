use crate::config::SsoConfig;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoCache {
    pub enabled: bool,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
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
        }
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
