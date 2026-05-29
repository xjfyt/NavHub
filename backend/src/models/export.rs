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
    #[serde(default = "default_group_icon")]
    pub icon: String,
}

fn default_group_icon() -> String {
    "grid".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(default)]
    pub image_asset: Option<ExportedAssetData>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderItemData {
    pub name: String,
    pub letter: Option<String>,
    pub color: i32,
    pub url: Option<String>,
    pub image_url: Option<String>,
    #[serde(default)]
    pub image_asset: Option<ExportedAssetData>,
    pub image_style: String,
    pub image_radius: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WidgetData {
    pub widget: String,
    pub w_span: i32,
    pub w_row: Option<i32>,
    pub config: serde_json::Value,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedAssetData {
    pub data: String,
    pub content_type: Option<String>,
    pub filename: Option<String>,
    pub sha256: Option<String>,
}

// ---------------------------------------------------------------------------
// DATA-8: 个人全量数据导出(GDPR 数据可携带)。返回请求者本人的全部数据:个人资料、
// 偏好(含自定义搜索引擎/小组件配置)、其拥有的分组及分组内的图标/文件夹项/小组件、
// 以及系统消息已读状态。仅导出 user.id 本人数据(无路径参数 => 无 IDOR)。
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserDataExport {
    /// 导出格式版本,便于将来演进/导入侧识别。
    pub format_version: u32,
    pub exported_at: String,
    pub profile: ExportedProfile,
    pub preferences: ExportedPreferences,
    pub groups: Vec<ExportedUserGroup>,
    pub message_reads: Vec<ExportedMessageRead>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedProfile {
    pub id: String,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub casdoor_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedPreferences {
    pub tweaks: serde_json::Value,
    pub custom_engines: serde_json::Value,
    pub pushed_group_wallpapers: serde_json::Value,
    pub sidebar_order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedUserGroup {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: String,
    pub icons: Vec<IconExportData>,
    pub widgets: Vec<WidgetData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedMessageRead {
    pub message_id: String,
    pub read_at: String,
}
