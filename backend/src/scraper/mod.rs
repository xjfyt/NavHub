pub mod bing;
pub mod desktophut;
pub mod nasa;
pub mod pexels;
pub mod pixabay;
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
