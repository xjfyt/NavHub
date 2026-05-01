use super::{ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct PexelsScraper {
    client: reqwest::Client,
}

impl PexelsScraper {
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
struct PexelsResp {
    photos: Vec<PexelsPhoto>,
}

#[derive(Debug, Deserialize)]
struct PexelsPhoto {
    url: String,
    photographer: String,
    alt: Option<String>,
    src: PexelsSrc,
}

#[derive(Debug, Deserialize)]
struct PexelsSrc {
    original: String,
    medium: String,
}

#[async_trait::async_trait]
impl Scraper for PexelsScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://api.pexels.com/v1/curated?per_page=30&api_key=YOUR_KEY
        // api_key is extracted and sent as Authorization header per Pexels docs.
        let api_key = extract_param(site_url, "api_key").unwrap_or_default();
        let clean_url = remove_param(site_url, "api_key");

        let resp: PexelsResp = self
            .client
            .get(&clean_url)
            .header("Authorization", api_key)
            .send()
            .await
            .context("pexels api fetch")?
            .error_for_status()
            .context("pexels api error")?
            .json()
            .await
            .context("pexels api parse")?;

        let results = resp
            .photos
            .into_iter()
            .take(batch_size)
            .map(|photo| ScrapedWallpaper {
                title: photo.alt.filter(|s| !s.is_empty()),
                video_url: photo.src.original,
                thumbnail_url: Some(photo.src.medium),
                page_url: Some(photo.url),
                author: Some(photo.photographer),
                media_type: "image".to_string(),
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
