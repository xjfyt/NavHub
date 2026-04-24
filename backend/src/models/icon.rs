use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Icon {
    pub id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub url: Option<String>,
    pub sub: Option<String>,
    pub title: Option<String>,
    pub cta: Option<String>,
    pub size: String,
    pub letter: Option<String>,
    pub color: i32,
    pub image_url: Option<String>,
    pub image_style: String,
    pub image_radius: String,
    pub is_folder: bool,
    pub iframe_preview: bool,
    pub sort_order: i32,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub font_size: String,
    pub text_align: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct FolderItem {
    pub id: Uuid,
    pub folder_icon_id: Uuid,
    pub name: String,
    pub letter: Option<String>,
    pub color: i32,
    pub url: Option<String>,
    pub image_url: Option<String>,
    pub image_style: String,
    pub image_radius: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconView {
    pub id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub url: Option<String>,
    pub sub: Option<String>,
    pub title: Option<String>,
    pub cta: Option<String>,
    pub size: String,
    pub letter: Option<String>,
    pub color: i32,
    pub image_url: Option<String>,
    pub image_style: String,
    pub image_radius: String,
    pub is_folder: bool,
    pub iframe_preview: bool,
    pub sort_order: i32,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub font_size: String,
    pub text_align: String,
    pub folder_items: Vec<FolderItemView>,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderItemView {
    pub id: Uuid,
    pub name: String,
    pub letter: Option<String>,
    pub color: i32,
    pub url: Option<String>,
    pub image_url: Option<String>,
    pub image_style: String,
    pub image_radius: String,
    pub sort_order: i32,
}

impl From<FolderItem> for FolderItemView {
    fn from(f: FolderItem) -> Self {
        Self {
            id: f.id,
            name: f.name,
            letter: f.letter,
            color: f.color,
            url: f.url,
            image_url: f.image_url,
            image_style: f.image_style,
            image_radius: f.image_radius,
            sort_order: f.sort_order,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconCreate {
    pub group_id: Uuid,
    pub name: String,
    pub url: Option<String>,
    pub sub: Option<String>,
    pub title: Option<String>,
    pub cta: Option<String>,
    #[serde(default = "default_size")]
    pub size: String,
    pub letter: Option<String>,
    #[serde(default)]
    pub color: i32,
    pub image_url: Option<String>,
    #[serde(default = "default_image_style")]
    pub image_style: String,
    #[serde(default = "default_image_radius")]
    pub image_radius: String,
    #[serde(default)]
    pub is_folder: bool,
    #[serde(default)]
    pub iframe_preview: bool,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
}

fn default_size() -> String {
    "sq".into()
}

fn default_image_style() -> String {
    "framed".into()
}

fn default_image_radius() -> String {
    "rounded".into()
}

fn default_font_size() -> String {
    "md".into()
}

fn default_text_align() -> String {
    "center".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconUpdate {
    pub name: Option<String>,
    pub url: Option<String>,
    pub sub: Option<String>,
    pub title: Option<String>,
    pub cta: Option<String>,
    pub size: Option<String>,
    pub letter: Option<String>,
    pub color: Option<i32>,
    pub image_url: Option<String>,
    pub image_style: Option<String>,
    pub image_radius: Option<String>,
    pub iframe_preview: Option<bool>,
    pub group_id: Option<Uuid>,
    pub font_size: Option<String>,
    pub text_align: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconReorderRequest {
    pub group_id: Uuid,
    pub order: Vec<Uuid>,
}
