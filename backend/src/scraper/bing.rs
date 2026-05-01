use super::{Scraper, ScrapedWallpaper};
use anyhow::Result;
use serde::Deserialize;

pub struct BingScraper;

impl BingScraper {
    pub fn new() -> Self {
        Self
    }
}

#[derive(Debug, Deserialize)]
struct BingApiResp {
    images: Vec<BingImage>,
}

#[derive(Debug, Deserialize)]
struct BingImage {
    url: String,
    #[serde(rename = "urlbase")]
    url_base: String,
    title: String,
    copyright: Option<String>,
    #[serde(rename = "copyrightlink")]
    copyright_link: Option<String>,
}

#[async_trait::async_trait]
impl Scraper for BingScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (compatible; NavHub/1.0)")
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        // Bing API: idx=0 is today, max idx=14 (15 days archive), max n=8 per request
        let per_req = 8usize;
        let mut results = Vec::new();
        let mut idx = 0usize;

        // Extract market from site_url if present, else default
        let mkt = extract_param(site_url, "mkt").unwrap_or_else(|| "zh-CN".to_string());

        while results.len() < batch_size && idx < 15 {
            let n = per_req.min(batch_size - results.len());
            let url = format!(
                "https://www.bing.com/HPImageArchive.aspx?format=js&idx={idx}&n={n}&mkt={mkt}"
            );

            let resp = client.get(&url).send().await?;
            if !resp.status().is_success() {
                anyhow::bail!("Bing API returned {}", resp.status());
            }

            let data: BingApiResp = resp.json().await?;
            if data.images.is_empty() {
                break;
            }

            for img in data.images {
                // img.url already contains resolution suffix like _1920x1080.jpg
                let full_url = format!("https://www.bing.com{}", img.url);
                // Thumbnail: urlbase + _640x360.jpg
                let thumb_url = format!("https://www.bing.com{}_640x360.jpg", img.url_base);

                // Copyright is usually "Title (© Author Name, Getty Images)"
                let author = img.copyright.as_deref().and_then(parse_copyright_author);

                results.push(ScrapedWallpaper {
                    title: Some(img.title),
                    video_url: full_url,
                    thumbnail_url: Some(thumb_url),
                    page_url: img.copyright_link,
                    author: author.map(|s| s.to_string()),
                    media_type: "image".to_string(),
                });
            }

            idx += per_req;
        }

        Ok(results.into_iter().take(batch_size).collect())
    }
}

fn extract_param(url: &str, key: &str) -> Option<String> {
    url.split_once('?')?
        .1
        .split('&')
        .find_map(|param| {
            let (k, v) = param.split_once('=')?;
            if k == key { Some(v.to_string()) } else { None }
        })
}

fn parse_copyright_author(copyright: &str) -> Option<&str> {
    // Format: "Description (© Author Name)"  or "(© Author Name)"
    let start = copyright.find("© ")? + 2;
    let slice = &copyright[start..];
    let end = slice.rfind(')').unwrap_or(slice.len());
    let author = slice[..end].trim();
    if author.is_empty() {
        None
    } else {
        Some(author)
    }
}
