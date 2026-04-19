use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct UserPreferences {
    pub user_id: Uuid,
    pub tweaks: serde_json::Value,
    pub custom_engines: serde_json::Value,
    pub pushed_group_wallpapers: serde_json::Value,
    pub sidebar_order: Vec<Uuid>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesView {
    pub tweaks: serde_json::Value,
    pub custom_engines: serde_json::Value,
    pub pushed_group_wallpapers: serde_json::Value,
    pub sidebar_order: Vec<Uuid>,
}

impl Default for PreferencesView {
    fn default() -> Self {
        Self {
            tweaks: serde_json::json!({}),
            custom_engines: serde_json::json!([]),
            pushed_group_wallpapers: serde_json::json!({}),
            sidebar_order: Vec::new(),
        }
    }
}

impl From<UserPreferences> for PreferencesView {
    fn from(p: UserPreferences) -> Self {
        Self {
            tweaks: p.tweaks,
            custom_engines: p.custom_engines,
            pushed_group_wallpapers: p.pushed_group_wallpapers,
            sidebar_order: p.sidebar_order,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub tweaks: Option<serde_json::Value>,
    pub custom_engines: Option<serde_json::Value>,
    pub pushed_group_wallpapers: Option<serde_json::Value>,
    pub sidebar_order: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct CustomEngineCreate {
    pub name: String,
    pub url: String,
    pub color: Option<String>,
    pub label: Option<String>,
}
