use super::{truncate_title, ScrapedWallpaper, Scraper};
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashSet;

pub struct BingScraper {
    client: reqwest::Client,
}

impl BingScraper {
    pub fn new() -> Result<Self> {
        // QUAL-7: 此前在 scrape() 里每次现场 build 客户端(且绕过集中 builder)。改为
        // 在 new() 里经集中 builder 构造一次并复用(连接超时 10s、整体 30s)。Bing 需要
        // 浏览器 UA,不能共用 NavHub/1.0 的 default_client。构造失败向上传播。
        let client = super::build_scraper_client("Mozilla/5.0 (compatible; NavHub/1.0)")?;
        Ok(Self { client })
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
        // QUAL-7: 复用 new() 中构造好的共享客户端,而非每次 scrape 现场重建。
        let client = &self.client;

        // Bing HPImageArchive returns at most 8 images per request. Recent
        // behavior clamps high idx values to the oldest public window, so page
        // with one item of overlap and stop as soon as a page adds nothing.
        let per_req = 8usize;
        let page_stride = per_req - 1;
        let mut results = Vec::new();
        let mut seen = HashSet::new();
        let mut idx = extract_param(site_url, "idx")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0);

        // Extract market from site_url if present, else default
        let mkt = extract_param(site_url, "mkt").unwrap_or_else(|| "zh-CN".to_string());
        let max_requests = ((batch_size / page_stride) + 3).clamp(1, 100);
        let mut requests = 0usize;

        while results.len() < batch_size && requests < max_requests {
            let remaining = batch_size - results.len();
            let overlap = if requests > 0 { 1 } else { 0 };
            let n = per_req.min(remaining + overlap);
            let url = format!(
                "https://www.bing.com/HPImageArchive.aspx?format=js&idx={idx}&n={n}&mkt={mkt}"
            );
            requests += 1;

            let resp = client.get(&url).send().await?;
            if !resp.status().is_success() {
                anyhow::bail!("Bing API returned {}", resp.status());
            }

            let data: BingApiResp = resp.json().await?;
            if data.images.is_empty() {
                break;
            }

            let mut added = 0usize;
            for img in data.images {
                // img.url already contains resolution suffix like _1920x1080.jpg
                let full_url = format!("https://www.bing.com{}", img.url);
                if !seen.insert(full_url.clone()) {
                    continue;
                }

                // Thumbnail: urlbase + _640x360.jpg
                let thumb_url = format!("https://www.bing.com{}_640x360.jpg", img.url_base);

                // Copyright is usually "Title (© Author Name, Getty Images)"
                let author = img.copyright.as_deref().and_then(parse_copyright_author);

                results.push(ScrapedWallpaper {
                    title: truncate_title(Some(img.title), 80),
                    video_url: full_url,
                    thumbnail_url: Some(thumb_url),
                    page_url: img.copyright_link,
                    author: author.map(|s| s.to_string()),
                    media_type: "image".to_string(),
                });
                added += 1;

                if results.len() >= batch_size {
                    break;
                }
            }

            if added == 0 {
                break;
            }

            idx += page_stride;
        }

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
