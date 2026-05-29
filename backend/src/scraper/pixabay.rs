use super::{
    is_blocked_wallpaper_subject, is_wallpaper_dimensions, truncate_title, ScrapedWallpaper,
    Scraper,
};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct PixabayScraper {
    client: reqwest::Client,
}

impl PixabayScraper {
    pub fn new() -> Result<Self> {
        // INFRA-8: 构造失败向上传播,不再 unwrap_or_default 静默退化。
        let client = super::build_scraper_client("NavHub/1.0")?;
        Ok(Self { client })
    }
}

#[derive(Debug, Deserialize)]
struct PixabayResp {
    hits: Vec<PixabayHit>,
}

#[derive(Debug, Deserialize)]
struct PixabayHit {
    #[serde(rename = "largeImageURL")]
    large_image_url: String,
    #[serde(rename = "webformatURL")]
    webformat_url: String,
    #[serde(rename = "pageURL")]
    page_url: String,
    user: String,
    tags: String,
    #[serde(rename = "imageWidth", default)]
    image_width: u32,
    #[serde(rename = "imageHeight", default)]
    image_height: u32,
}

#[async_trait::async_trait]
impl Scraper for PixabayScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://pixabay.com/api/?key=YOUR_KEY&category=nature&min_width=1920&per_page=30&order=popular
        let resp: PixabayResp = self
            .client
            .get(site_url)
            .send()
            .await
            .context("pixabay api fetch")?
            .error_for_status()
            .context("pixabay api error")?
            .json()
            .await
            .context("pixabay api parse")?;

        let results = resp
            .hits
            .into_iter()
            .filter(is_quality_pixabay_hit)
            .take(batch_size)
            .map(|hit| {
                let title = truncate_title(
                    if hit.tags.is_empty() {
                        None
                    } else {
                        Some(hit.tags)
                    },
                    80,
                );

                ScrapedWallpaper {
                    title,
                    video_url: hit.large_image_url,
                    thumbnail_url: Some(hit.webformat_url),
                    page_url: Some(hit.page_url),
                    author: Some(hit.user),
                    media_type: "image".to_string(),
                }
            })
            .collect();

        Ok(results)
    }
}

fn is_quality_pixabay_hit(hit: &PixabayHit) -> bool {
    is_wallpaper_dimensions(hit.image_width, hit.image_height)
        && !is_blocked_wallpaper_subject(&hit.tags)
}
