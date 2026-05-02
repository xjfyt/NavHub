use super::{truncate_title, ScrapedWallpaper, Scraper, MIN_IMAGE_DIMENSION};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct WallhavenScraper {
    client: reqwest::Client,
}

impl WallhavenScraper {
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
struct WallhavenResp {
    data: Vec<WallhavenItem>,
}

#[derive(Debug, Deserialize)]
struct WallhavenItem {
    url: String,
    path: String,
    file_type: String,
    thumbs: WallhavenThumbs,
    tags: Option<Vec<WallhavenTag>>,
    #[serde(default)]
    dimension_x: u32,
    #[serde(default)]
    dimension_y: u32,
}

#[derive(Debug, Deserialize)]
struct WallhavenThumbs {
    large: String,
}

#[derive(Debug, Deserialize)]
struct WallhavenTag {
    name: String,
}

#[async_trait::async_trait]
impl Scraper for WallhavenScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://wallhaven.cc/api/v1/search?purity=100&categories=110&sorting=hot&atleast=1920x1080
        // Optional apikey param for NSFW/sketchy content or higher rate limits.
        let api_key = extract_param(site_url, "apikey");
        let clean_url = remove_param(site_url, "apikey");

        let mut req = self.client.get(&clean_url);
        if let Some(key) = api_key {
            req = req.header("X-API-Key", key);
        }

        let resp: WallhavenResp = req
            .send()
            .await
            .context("wallhaven api fetch")?
            .error_for_status()
            .context("wallhaven api error")?
            .json()
            .await
            .context("wallhaven api parse")?;

        let results = resp
            .data
            .into_iter()
            .filter(|item| {
                let min_side = item.dimension_x.min(item.dimension_y);
                min_side == 0 || min_side >= MIN_IMAGE_DIMENSION
            })
            .take(batch_size)
            .map(|item| {
                let title = truncate_title(
                    item.tags.and_then(|tags| {
                        let names: Vec<_> = tags.into_iter().take(3).map(|t| t.name).collect();
                        if names.is_empty() { None } else { Some(names.join(", ")) }
                    }),
                    80,
                );

                let media_type = if item.file_type.starts_with("video") {
                    "video".to_string()
                } else {
                    "image".to_string()
                };

                ScrapedWallpaper {
                    title,
                    video_url: item.path,
                    thumbnail_url: Some(item.thumbs.large),
                    page_url: Some(item.url),
                    author: None,
                    media_type,
                }
            })
            .collect();

        Ok(results)
    }
}

fn extract_param(url: &str, key: &str) -> Option<String> {
    url.split_once('?')?.1.split('&').find_map(|param| {
        let (k, v) = param.split_once('=')?;
        if k == key {
            Some(v.to_string())
        } else {
            None
        }
    })
}

fn remove_param(url: &str, key: &str) -> String {
    if let Some((base, query)) = url.split_once('?') {
        let prefix = format!("{}=", key);
        let filtered: Vec<&str> = query
            .split('&')
            .filter(|p| !p.starts_with(&prefix))
            .collect();
        if filtered.is_empty() {
            base.to_string()
        } else {
            format!("{}?{}", base, filtered.join("&"))
        }
    } else {
        url.to_string()
    }
}
