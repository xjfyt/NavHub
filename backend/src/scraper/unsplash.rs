use super::{
    is_blocked_wallpaper_subject, is_wallpaper_dimensions, truncate_title, ScrapedWallpaper,
    Scraper,
};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct UnsplashScraper {
    client: reqwest::Client,
}

impl UnsplashScraper {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("NavHub/1.0")
            // INFRA-1: 增加连接超时,避免慢/恶意主机拖住建连阶段。
            .connect_timeout(std::time::Duration::from_secs(10))
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
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
    urls: UnsplashUrls,
    links: UnsplashLinks,
    user: UnsplashUser,
}

#[derive(Debug, Deserialize)]
struct UnsplashUrls {
    raw: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashLinks {
    html: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashUser {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum UnsplashResp {
    List(Vec<UnsplashPhoto>),
    Search { results: Vec<UnsplashPhoto> },
}

#[async_trait::async_trait]
impl Scraper for UnsplashScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://api.unsplash.com/search/photos?query=nature+landscape&orientation=landscape&per_page=30&client_id=YOUR_KEY
        // or collection:
        // https://api.unsplash.com/collections/1053828/photos?per_page=30&client_id=YOUR_KEY
        let resp: UnsplashResp = self
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
        let photos = match resp {
            UnsplashResp::List(photos) => photos,
            UnsplashResp::Search { results } => results,
        };

        let results = photos
            .into_iter()
            .filter(is_quality_unsplash_photo)
            .take(batch_size)
            .map(|p| {
                let title = truncate_title(
                    p.description
                        .filter(|s| !s.is_empty())
                        .or(p.alt_description)
                        .filter(|s| !s.is_empty()),
                    80,
                );

                // Crop from the original asset into a consistent high-resolution wallpaper frame.
                let full_url = append_raw_params(&p.urls.raw, "w=2560&h=1440&q=90&fm=jpg&fit=crop");
                // Thumbnail at 640px
                let thumb_url = append_raw_params(&p.urls.raw, "w=640&h=360&q=70&fm=jpg&fit=crop");

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

fn is_quality_unsplash_photo(photo: &UnsplashPhoto) -> bool {
    if !is_wallpaper_dimensions(photo.width, photo.height) {
        return false;
    }

    let subject = format!(
        "{} {} {}",
        photo.description.as_deref().unwrap_or_default(),
        photo.alt_description.as_deref().unwrap_or_default(),
        photo.links.html
    );
    !is_blocked_wallpaper_subject(&subject)
}

fn append_raw_params(raw_url: &str, params: &str) -> String {
    let sep = if raw_url.contains('?') { "&" } else { "?" };
    format!("{raw_url}{sep}{params}")
}
