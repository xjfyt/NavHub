use super::{ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct NasaScraper {
    client: reqwest::Client,
}

impl NasaScraper {
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
struct NasaSearchResp {
    collection: NasaCollection,
}

#[derive(Debug, Deserialize)]
struct NasaCollection {
    items: Vec<NasaItem>,
}

#[derive(Debug, Deserialize)]
struct NasaItem {
    data: Vec<NasaItemData>,
    links: Option<Vec<NasaLink>>,
}

#[derive(Debug, Deserialize)]
struct NasaItemData {
    title: Option<String>,
    photographer: Option<String>,
    _description: Option<String>,
    nasa_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NasaLink {
    href: String,
    rel: Option<String>,
    render: Option<String>,
}

#[async_trait::async_trait]
impl Scraper for NasaScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url is the NASA API search URL, e.g.:
        // https://images-api.nasa.gov/search?q=earth&media_type=image&page_size=20
        let resp: NasaSearchResp = self
            .client
            .get(site_url)
            .send()
            .await
            .context("nasa api fetch")?
            .json()
            .await
            .context("nasa api parse")?;

        let mut results = Vec::new();

        for item in resp.collection.items.iter().take(batch_size) {
            let data = item.data.first();
            let title = data.and_then(|d| d.title.clone());
            let author = data.and_then(|d| d.photographer.clone());
            let nasa_id = data.and_then(|d| d.nasa_id.clone());

            let links = item.links.as_deref().unwrap_or(&[]);

            // Canonical link is the full-resolution image (~orig.jpg)
            let canonical_url = links
                .iter()
                .find(|l| l.rel.as_deref() == Some("canonical"))
                .map(|l| l.href.clone());

            // Preview link is the thumbnail (~thumb.jpg)
            let thumb_url = links
                .iter()
                .find(|l| l.rel.as_deref() == Some("preview"))
                .map(|l| l.href.clone());

            // Fall back to deriving orig from thumb if no canonical link
            let large_url = canonical_url.or_else(|| {
                thumb_url.as_ref().map(|t| {
                    t.replace("~thumb.jpg", "~orig.jpg")
                        .replace("~small.jpg", "~orig.jpg")
                })
            });

            let Some(large_url) = large_url else { continue };

            let page_url = nasa_id
                .as_ref()
                .map(|id| format!("https://images.nasa.gov/details/{id}"));

            results.push(ScrapedWallpaper {
                title,
                video_url: large_url,
                thumbnail_url: thumb_url,
                page_url,
                author,
                media_type: "image".to_string(),
            });
        }

        Ok(results)
    }
}
