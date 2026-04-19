use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Widget {
    pub id: Uuid,
    pub group_id: Uuid,
    pub widget_type: String,
    pub w_span: i32,
    pub w_row: Option<i32>,
    pub config: serde_json::Value,
    pub sort_order: i32,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetView {
    pub id: Uuid,
    pub group_id: Uuid,
    pub widget: String,
    pub w_span: i32,
    pub w_row: Option<i32>,
    pub config: serde_json::Value,
    pub sort_order: i32,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub read_only: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetCreate {
    pub group_id: Uuid,
    pub widget: String,
    #[serde(default = "default_span")]
    pub w_span: i32,
    pub w_row: Option<i32>,
    #[serde(default)]
    pub config: serde_json::Value,
}

fn default_span() -> i32 {
    2
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetUpdate {
    pub w_span: Option<i32>,
    pub w_row: Option<i32>,
    pub config: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
    pub group_id: Option<Uuid>,
}
