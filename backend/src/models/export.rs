use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupExportData {
    pub group: GroupData,
    pub icons: Vec<IconExportData>,
    pub widgets: Vec<WidgetData>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupData {
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconExportData {
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
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    pub folder_items: Vec<FolderItemData>,
}

fn default_font_size() -> String {
    "md".into()
}

fn default_text_align() -> String {
    "center".into()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderItemData {
    pub name: String,
    pub letter: Option<String>,
    pub color: i32,
    pub url: Option<String>,
    pub image_url: Option<String>,
    pub image_style: String,
    pub image_radius: String,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetData {
    pub widget: String,
    pub w_span: i32,
    pub w_row: Option<i32>,
    pub config: serde_json::Value,
    pub sort_order: i32,
}
