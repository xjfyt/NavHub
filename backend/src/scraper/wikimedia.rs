use super::{
    is_blocked_wallpaper_subject, is_wallpaper_dimensions, truncate_title, ScrapedWallpaper,
    Scraper,
};
use anyhow::{Context, Result};
use serde::Deserialize;
use url::Url;

pub struct WikimediaScraper {
    client: reqwest::Client,
}

impl WikimediaScraper {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(
                "NavHub/1.0 (https://github.com/navhub; contact: navhub@example.com) reqwest/0.12",
            )
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
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    mime: Option<String>,
    #[serde(default)]
    mediatype: Option<String>,
}

#[async_trait::async_trait]
impl Scraper for WikimediaScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url is the full API URL with category/query params
        let category_url = wikimedia_category_url(site_url, batch_size)?;
        let cm_resp: CategoryMembersResp = self
            .client
            .get(category_url.as_str())
            .send()
            .await
            .context("wikimedia categorymembers fetch")?
            .error_for_status()
            .context("wikimedia categorymembers error")?
            .json()
            .await
            .context("wikimedia categorymembers parse")?;

        let members = cm_resp.query.map(|q| q.members).unwrap_or_default();

        let titles: Vec<String> = members
            .iter()
            .take((batch_size * 5).clamp(30, 200))
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
            let info_url = format!(
                "https://commons.wikimedia.org/w/api.php?action=query&titles={}&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cmediatype&iiurlwidth=640&format=json",
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
                            if !is_quality_wikimedia_file(title, info) {
                                continue;
                            }
                            if let Some(url) = &info.url {
                                let media_type = infer_media_type(url, info);
                                results.push(ScrapedWallpaper {
                                    title: truncate_title(Some(name), 80),
                                    video_url: url.clone(),
                                    thumbnail_url: info.thumburl.clone(),
                                    page_url: info.description_url.clone(),
                                    author: None,
                                    media_type,
                                });
                            }
                        }
                    }

                    if results.len() >= batch_size {
                        break;
                    }
                }
            }

            if results.len() >= batch_size {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        Ok(results)
    }
}

fn wikimedia_category_url(site_url: &str, batch_size: usize) -> Result<Url> {
    let mut url = Url::parse(site_url).context("wikimedia source url parse")?;
    upsert_query_param(&mut url, "cmtype", "file");
    upsert_query_param(
        &mut url,
        "cmlimit",
        &(batch_size * 5).clamp(30, 200).to_string(),
    );
    Ok(url)
}

fn upsert_query_param(url: &mut Url, key: &str, value: &str) {
    let mut params: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(k, _)| k != key)
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    params.push((key.to_string(), value.to_string()));

    url.set_query(None);
    {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in params {
            pairs.append_pair(&k, &v);
        }
    }
}

fn is_quality_wikimedia_file(title: &str, info: &ImageInfo) -> bool {
    if is_blocked_wallpaper_subject(title) {
        return false;
    }

    match (info.width, info.height) {
        (Some(w), Some(h)) if is_wallpaper_dimensions(w, h) => {}
        _ => return false,
    }

    let media_type = info.mediatype.as_deref().unwrap_or_default();
    let mime = info.mime.as_deref().unwrap_or_default();
    media_type == "VIDEO" || mime.starts_with("image/")
}

fn infer_media_type(url: &str, info: &ImageInfo) -> String {
    if info.mediatype.as_deref() == Some("VIDEO") {
        return "video".to_string();
    }

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
