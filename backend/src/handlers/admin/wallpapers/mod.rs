//! Admin wallpaper handlers.
//!
//! QUAL-9: 原单文件 wallpapers.rs(780 行)按职责拆分为子模块。下方 `pub use`
//! 保持 `crate::handlers::admin::wallpapers::<name>` 的对外路径与拆分前完全一致,
//! 故 routes.rs / tasks.rs 等引用方无需改动。纯代码搬移,行为不变。
mod fetch;
mod list;
mod sources;
mod types;
mod upload;

// 来源 CRUD + 共享对象清理工具(collect_wallpaper_keys 供 tasks.rs 复用)。
pub use sources::{
    collect_wallpaper_keys, create_source, delete_source, list_sources, update_source,
};

// 手动触发抓取 + 后台 run_fetch(供 tasks.rs 调度复用)。
pub use fetch::{run_fetch, trigger_fetch};

// 壁纸列表 / 更新 / 删除。
pub use list::{delete_wallpaper, list_wallpapers, update_wallpaper};

// 手动上传。
pub use upload::upload_wallpaper;

// 请求/响应 DTO。这些类型在拆分前即为 `pub`(随 handler 同模块),外部当前无直接
// 引用,但为保持对外路径 `wallpapers::<Dto>` 与拆分前完全一致而在此再导出。
#[allow(unused_imports)]
pub use types::{AdminWallpaperListResponse, ListWallpapersQuery, UpdateWallpaperReq};
