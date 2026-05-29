use super::{
    is_blocked_wallpaper_subject, is_wallpaper_dimensions, truncate_title, ScrapedWallpaper,
    Scraper,
};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::HashSet;
use url::Url;

pub struct NasaScraper {
    client: reqwest::Client,
}

impl NasaScraper {
    pub fn new() -> Result<Self> {
        // QUAL-7: 复用进程级共享 NavHub/1.0 客户端(共用连接池);构造失败仍向上传播。
        let client = super::default_client()?;
        Ok(Self { client })
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
    description: Option<String>,
    keywords: Option<Vec<String>>,
    nasa_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NasaLink {
    href: String,
    rel: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

#[async_trait::async_trait]
impl Scraper for NasaScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url is the NASA API search URL, e.g.:
        // https://images-api.nasa.gov/search?q=aurora+nebula+galaxy+earth&media_type=image&page_size=80
        let requests = nasa_query_urls(site_url, batch_size)?;
        let mut results = Vec::new();
        let mut seen = HashSet::new();

        for url in requests {
            let resp: NasaSearchResp = self
                .client
                .get(url.as_str())
                .send()
                .await
                .context("nasa api fetch")?
                .error_for_status()
                .context("nasa api error")?
                .json()
                .await
                .context("nasa api parse")?;

            for item in resp.collection.items {
                if results.len() >= batch_size {
                    break;
                }

                let Some(wallpaper) = nasa_item_to_wallpaper(item) else {
                    continue;
                };
                if !seen.insert(wallpaper.video_url.clone()) {
                    continue;
                }

                results.push(wallpaper);
            }

            if results.len() >= batch_size {
                break;
            }
        }

        Ok(results)
    }
}

fn nasa_query_urls(site_url: &str, batch_size: usize) -> Result<Vec<Url>> {
    let parsed = Url::parse(site_url).context("nasa source url parse")?;
    let terms = parsed
        .query_pairs()
        .find(|(key, _)| key == "q")
        .map(|(_, value)| split_nasa_terms(&value))
        .filter(|terms| terms.len() > 1)
        .unwrap_or_default();

    if terms.is_empty() {
        let mut url = parsed;
        upsert_query_param(&mut url, "media_type", "image");
        upsert_query_param(
            &mut url,
            "page_size",
            &(batch_size * 4).clamp(20, 100).to_string(),
        );
        return Ok(vec![url]);
    }

    let mut urls = Vec::new();
    for term in terms.into_iter().take(6) {
        let mut url = parsed.clone();
        upsert_query_param(&mut url, "q", &term);
        upsert_query_param(&mut url, "media_type", "image");
        upsert_query_param(
            &mut url,
            "page_size",
            &(batch_size * 3).clamp(20, 100).to_string(),
        );
        urls.push(url);
    }
    Ok(urls)
}

fn split_nasa_terms(q: &str) -> Vec<String> {
    q.split(|c: char| c == '+' || c == ',' || c == ';' || c.is_whitespace())
        .map(str::trim)
        .filter(|s| s.len() >= 3)
        .map(ToString::to_string)
        .collect()
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

fn nasa_item_to_wallpaper(item: NasaItem) -> Option<ScrapedWallpaper> {
    let data = item.data.first();
    let title = data.and_then(|d| d.title.clone());
    let author = data
        .and_then(|d| d.photographer.clone())
        .or_else(|| Some("NASA".to_string()));
    let nasa_id = data.and_then(|d| d.nasa_id.clone());

    let mut subject = String::new();
    if let Some(t) = &title {
        subject.push_str(t);
        subject.push(' ');
    }
    if let Some(desc) = data.and_then(|d| d.description.as_deref()) {
        subject.push_str(desc);
        subject.push(' ');
    }
    if let Some(keywords) = data.and_then(|d| d.keywords.as_ref()) {
        subject.push_str(&keywords.join(" "));
    }
    if is_blocked_wallpaper_subject(&subject) {
        return None;
    }

    let links = item.links.as_deref().unwrap_or(&[]);
    let large_link = links
        .iter()
        .filter(|link| {
            link.rel.as_deref() == Some("canonical") || link.rel.as_deref() == Some("alternate")
        })
        .filter(|link| match (link.width, link.height) {
            (Some(w), Some(h)) => is_wallpaper_dimensions(w, h),
            _ => true,
        })
        .max_by_key(|link| {
            link.width
                .unwrap_or(0)
                .saturating_mul(link.height.unwrap_or(0))
        })?;

    let thumb_url = links
        .iter()
        .find(|l| l.rel.as_deref() == Some("preview"))
        .map(|l| l.href.clone());

    let page_url = nasa_id
        .as_ref()
        .map(|id| format!("https://images.nasa.gov/details/{id}"));

    Some(ScrapedWallpaper {
        title: truncate_title(title, 80),
        video_url: large_link.href.clone(),
        thumbnail_url: thumb_url,
        page_url,
        author,
        media_type: "image".to_string(),
    })
}
