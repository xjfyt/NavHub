pub mod bing;
pub mod desktophut;
pub mod nasa;
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

pub fn get_scraper(scraper_type: &str) -> Box<dyn Scraper> {
    match scraper_type {
        "bing" => Box::new(bing::BingScraper::new()),
        "desktophut" => Box::new(desktophut::DesktopHutScraper::new()),
        "wikimedia" => Box::new(wikimedia::WikimediaScraper::new()),
        "nasa" => Box::new(nasa::NasaScraper::new()),
        _ => Box::new(desktophut::DesktopHutScraper::new()),
    }
}
