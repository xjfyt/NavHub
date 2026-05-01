use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperSource {
    pub id: Uuid,
    pub name: String,
    pub site_url: String,
    pub enabled: bool,
    pub fetch_batch_size: i32,
    pub cache_ttl_hours: i32,
    pub fetch_interval_hours: i32,
    pub source_type: String,
    pub scraper_type: String,
    pub last_fetched_at: Option<DateTime<Utc>>,
    pub total_fetched: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWallpaper {
    pub id: Uuid,
    pub source_id: Uuid,
    pub title: Option<String>,
    pub original_url: String,
    pub page_url: Option<String>,
    pub storage_key: Option<String>,
    pub thumbnail_key: Option<String>,
    pub thumbnail_url: Option<String>,
    pub media_type: String,
    pub file_size_bytes: Option<i64>,
    pub author: Option<String>,
    pub fetched_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWallpaperSourceReq {
    pub name: String,
    pub site_url: String,
    pub enabled: Option<bool>,
    pub fetch_batch_size: Option<i32>,
    pub cache_ttl_hours: Option<i32>,
    pub fetch_interval_hours: Option<i32>,
    pub source_type: Option<String>,
    pub scraper_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWallpaperSourceReq {
    pub name: Option<String>,
    pub site_url: Option<String>,
    pub enabled: Option<bool>,
    pub fetch_batch_size: Option<i32>,
    pub cache_ttl_hours: Option<i32>,
    pub fetch_interval_hours: Option<i32>,
    pub source_type: Option<String>,
    pub scraper_type: Option<String>,
}
