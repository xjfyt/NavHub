use super::{ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use serde::Deserialize;

pub struct WikimediaScraper {
    client: reqwest::Client,
}

impl WikimediaScraper {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("NavHub/1.0 (https://github.com/navhub; contact: navhub@example.com) reqwest/0.12")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

// MediaWiki API response structures
#[derive(Debug, Deserialize)]
struct CategoryMembersResp {
    query: Option<CategoryMembersQuery>,
}

#[derive(Debug, Deserialize)]
struct CategoryMembersQuery {
    #[serde(rename = "categorymembers")]
    members: Vec<CategoryMember>,
}

#[derive(Debug, Deserialize)]
struct CategoryMember {
    title: String,
}

#[derive(Debug, Deserialize)]
struct ImageInfoResp {
    query: Option<ImageInfoQuery>,
}

#[derive(Debug, Deserialize)]
struct ImageInfoQuery {
    pages: std::collections::HashMap<String, ImageInfoPage>,
}

#[derive(Debug, Deserialize)]
struct ImageInfoPage {
    title: Option<String>,
    imageinfo: Option<Vec<ImageInfo>>,
}

#[derive(Debug, Deserialize)]
struct ImageInfo {
    url: Option<String>,
    thumburl: Option<String>,
    #[serde(rename = "descriptionurl")]
    description_url: Option<String>,
}

#[async_trait::async_trait]
impl Scraper for WikimediaScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url is the full API URL with category/query params
        let cm_resp: CategoryMembersResp = self
            .client
            .get(site_url)
            .send()
            .await
            .context("wikimedia categorymembers fetch")?
            .json()
            .await
            .context("wikimedia categorymembers parse")?;

        let members = cm_resp
            .query
            .map(|q| q.members)
            .unwrap_or_default();

        let titles: Vec<String> = members
            .iter()
            .take(batch_size)
            .map(|m| m.title.clone())
            .collect();

        if titles.is_empty() {
            return Ok(vec![]);
        }

        tracing::info!("wikimedia: fetching info for {} files", titles.len());

        let mut results = Vec::new();

        // Batch info requests (up to 50 titles per request)
        for chunk in titles.chunks(10) {
            let titles_param = chunk.join("|");
            // iiprop=url is sufficient; thumburl and descriptionurl are returned
            // automatically when iiurlwidth is set (comma-separated values are rejected
            // by the MediaWiki API — it requires pipe-separated, but url alone works)
            let info_url = format!(
                "https://commons.wikimedia.org/w/api.php?action=query&titles={}&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json",
                urlencoding::encode(&titles_param)
            );

            let info_resp: ImageInfoResp = match self
                .client
                .get(&info_url)
                .send()
                .await
                .and_then(|r| r.error_for_status())
            {
                Ok(r) => match r.json().await {
                    Ok(j) => j,
                    Err(e) => {
                        tracing::warn!("wikimedia imageinfo parse error: {e}");
                        continue;
                    }
                },
                Err(e) => {
                    tracing::warn!("wikimedia imageinfo fetch error: {e}");
                    continue;
                }
            };

            if let Some(query) = info_resp.query {
                for (_, page) in query.pages {
                    let title = page.title.as_deref().unwrap_or("");
                    let name = title
                        .strip_prefix("File:")
                        .unwrap_or(title)
                        .rsplit('.')
                        .skip(1)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join(".")
                        .replace('_', " ");

                    if let Some(infos) = page.imageinfo {
                        if let Some(info) = infos.first() {
                            if let Some(url) = &info.url {
                                let media_type = infer_media_type(url);
                                results.push(ScrapedWallpaper {
                                    title: Some(name),
                                    video_url: url.clone(),
                                    thumbnail_url: info.thumburl.clone(),
                                    page_url: info.description_url.clone(),
                                    author: None,
                                    media_type,
                                });
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        Ok(results)
    }
}

fn infer_media_type(url: &str) -> String {
    let lower = url.to_lowercase();
    if lower.ends_with(".webm")
        || lower.ends_with(".ogv")
        || lower.ends_with(".mp4")
        || lower.ends_with(".ogg")
    {
        "video".to_string()
    } else {
        "image".to_string()
    }
}
