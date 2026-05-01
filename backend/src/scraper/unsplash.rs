use super::{ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct UnsplashScraper {
    client: reqwest::Client,
}

impl UnsplashScraper {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("NavHub/1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

#[derive(Debug, Deserialize)]
struct UnsplashPhoto {
    description: Option<String>,
    alt_description: Option<String>,
    urls: UnsplashUrls,
    links: UnsplashLinks,
    user: UnsplashUser,
}

#[derive(Debug, Deserialize)]
struct UnsplashUrls {
    raw: String,
    thumb: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashLinks {
    html: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashUser {
    name: String,
}

#[async_trait::async_trait]
impl Scraper for UnsplashScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://api.unsplash.com/photos?per_page=30&order_by=popular&client_id=YOUR_KEY
        // or collection:
        // https://api.unsplash.com/collections/1053828/photos?per_page=30&client_id=YOUR_KEY
        let photos: Vec<UnsplashPhoto> = self
            .client
            .get(site_url)
            .header("Accept-Version", "v1")
            .send()
            .await
            .context("unsplash api fetch")?
            .error_for_status()
            .context("unsplash api error")?
            .json()
            .await
            .context("unsplash api parse")?;

        let results = photos
            .into_iter()
            .take(batch_size)
            .map(|p| {
                let title = p.description
                    .filter(|s| !s.is_empty())
                    .or(p.alt_description)
                    .filter(|s| !s.is_empty());

                // Append size params to raw URL for a proper 1920px wallpaper
                let full_url = format!("{}&w=1920&q=85&fm=jpg&fit=crop", p.urls.raw);
                // Thumbnail at 640px
                let thumb_url = format!("{}&w=640&q=70&fm=jpg&fit=crop", p.urls.raw);

                ScrapedWallpaper {
                    title,
                    video_url: full_url,
                    thumbnail_url: Some(thumb_url),
                    page_url: Some(p.links.html),
                    author: Some(p.user.name),
                    media_type: "image".to_string(),
                }
            })
            .collect();

        Ok(results)
    }
}
