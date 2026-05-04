pub mod bing;
pub mod desktophut;
pub mod nasa;
pub mod pexels;
pub mod pixabay;
pub mod iconify;
pub mod unsplash;
pub mod wallhaven;
pub mod wikimedia;

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct ScrapedWallpaper {
    pub title: Option<String>,
    pub video_url: String,
    pub thumbnail_url: Option<String>,
    pub page_url: Option<String>,
    pub author: Option<String>,
    pub media_type: String,
}

/// 截断标题至最多 max_chars 个 Unicode 字符，超出则追加省略号。
pub fn truncate_title(title: Option<String>, max_chars: usize) -> Option<String> {
    title.and_then(|t| {
        let trimmed = t.trim().to_string();
        if trimmed.is_empty() {
            return None;
        }
        let count = trimmed.chars().count();
        if count <= max_chars {
            Some(trimmed)
        } else {
            let truncated: String = trimmed.chars().take(max_chars).collect();
            Some(format!("{truncated}…"))
        }
    })
}

/// 高清判定：图像最短边阈值（像素）。
pub const MIN_IMAGE_DIMENSION: u32 = 1080;

#[async_trait::async_trait]
pub trait Scraper: Send + Sync {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>>;
}

/// No-op scraper for the built-in curated source; wallpapers are seeded via migration.
struct BuiltinScraper;

#[async_trait::async_trait]
impl Scraper for BuiltinScraper {
    async fn scrape(&self, _site_url: &str, _batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        Ok(vec![])
    }
}

pub fn get_scraper(scraper_type: &str) -> Box<dyn Scraper> {
    match scraper_type {
        "builtin" => Box::new(BuiltinScraper),
        "bing" => Box::new(bing::BingScraper::new()),
        "desktophut" => Box::new(desktophut::DesktopHutScraper::new()),
        "wikimedia" => Box::new(wikimedia::WikimediaScraper::new()),
        "nasa" => Box::new(nasa::NasaScraper::new()),
        "unsplash" => Box::new(unsplash::UnsplashScraper::new()),
        "wallhaven" => Box::new(wallhaven::WallhavenScraper::new()),
        "pexels" => Box::new(pexels::PexelsScraper::new()),
        "pixabay" => Box::new(pixabay::PixabayScraper::new()),
        _ => Box::new(desktophut::DesktopHutScraper::new()),
    }
}

#[derive(Debug, Clone)]
pub struct ScrapedIconAsset {
    pub title: Option<String>,
    pub svg_url: String,
    pub author: Option<String>,
}

#[async_trait::async_trait]
pub trait IconScraper: Send + Sync {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedIconAsset>>;
}

pub fn get_icon_scraper(scraper_type: &str) -> Box<dyn IconScraper> {
    match scraper_type {
        "iconify" => Box::new(iconify::IconifyScraper::new()),
        _ => Box::new(iconify::IconifyScraper::new()),
    }
}
