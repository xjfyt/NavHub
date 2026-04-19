use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Group {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    pub owner_id: Option<Uuid>,
    pub pushed: bool,
    pub push_target_type: String,
    pub push_target_role: Option<String>,
    pub push_target_user_id: Option<Uuid>,
    pub push_allow_edit: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[sqlx(default)]
    pub owner_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    pub owner_id: Option<Uuid>,
    pub owner_name: Option<String>,
    pub pushed: bool,
    pub push_target_type: String,
    pub push_target_role: Option<String>,
    pub push_target_user_id: Option<Uuid>,
    pub push_allow_edit: bool,
    pub sort_order: i32,
    pub read_only: bool,
}

#[derive(Debug, Deserialize)]
pub struct GroupCreate {
    pub name: String,
    #[serde(default = "default_icon")]
    pub icon: String,
}

fn default_icon() -> String {
    "grid".into()
}

#[derive(Debug, Deserialize)]
pub struct GroupUpdate {
    pub name: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub order: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupItem {
    pub id: Uuid,
    pub r#type: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct GroupItemsReorderRequest {
    pub order: Vec<GroupItem>,
}
