use super::{truncate_title, ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use scraper::{Html, Selector};

pub struct DesktopHutScraper {
    client: reqwest::Client,
}

impl DesktopHutScraper {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }

    async fn fetch_html(&self, url: &str) -> Result<String> {
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .context("http fetch failed")?;
        if !resp.status().is_success() {
            anyhow::bail!("http {}: {url}", resp.status());
        }
        resp.text().await.context("read body failed")
    }

    fn extract_listing_links(&self, html: &str, base_url: &str) -> Vec<String> {
        let doc = Html::parse_document(html);
        let mut links = Vec::new();

        // Try common selectors for wallpaper listing pages
        let link_selectors = [
            "article a[href]",
            ".entry-title a[href]",
            ".post-title a[href]",
            "h2 a[href]",
            "h3 a[href]",
            ".thumbnail a[href]",
            ".item a[href]",
            "a.more-link[href]",
        ];

        let base = url::Url::parse(base_url).ok();

        for sel_str in &link_selectors {
            if let Ok(sel) = Selector::parse(sel_str) {
                for el in doc.select(&sel) {
                    if let Some(href) = el.value().attr("href") {
                        let url = if href.starts_with("http") {
                            href.to_string()
                        } else if let Some(ref b) = base {
                            match b.join(href) {
                                Ok(u) => u.to_string(),
                                Err(_) => continue,
                            }
                        } else {
                            continue;
                        };

                        // Only keep URLs that look like wallpaper detail pages
                        if is_wallpaper_page_url(&url) && !links.contains(&url) {
                            links.push(url);
                        }
                    }
                }
            }
            if !links.is_empty() {
                break;
            }
        }

        // Fallback: all <a href> that look like wallpaper pages
        if links.is_empty() {
            if let Ok(sel) = Selector::parse("a[href]") {
                for el in doc.select(&sel) {
                    if let Some(href) = el.value().attr("href") {
                        let url = if href.starts_with("http") {
                            href.to_string()
                        } else if let Some(ref b) = base {
                            match b.join(href) {
                                Ok(u) => u.to_string(),
                                Err(_) => continue,
                            }
                        } else {
                            continue;
                        };
                        if is_wallpaper_page_url(&url) && !links.contains(&url) {
                            links.push(url);
                        }
                    }
                }
            }
        }

        links
    }

    fn scrape_wallpaper_page(&self, html: &str, page_url: &str) -> Option<ScrapedWallpaper> {
        let doc = Html::parse_document(html);

        // Extract title from og:title or <title>
        let title = extract_meta(&doc, "og:title")
            .or_else(|| extract_meta(&doc, "twitter:title"))
            .or_else(|| {
                Selector::parse("title")
                    .ok()
                    .and_then(|sel| doc.select(&sel).next())
                    .map(|el| el.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty())
            });

        // Extract video URL: try og:video, then <source>, then <video src>
        let video_url = extract_meta(&doc, "og:video")
            .or_else(|| extract_meta(&doc, "og:video:url"))
            .or_else(|| extract_meta(&doc, "og:video:secure_url"))
            .or_else(|| {
                Selector::parse("source[src]")
                    .ok()
                    .and_then(|sel| doc.select(&sel).next())
                    .and_then(|el| el.value().attr("src"))
                    .map(|s| s.to_string())
                    .filter(|s| looks_like_video(s))
            })
            .or_else(|| {
                Selector::parse("video[src]")
                    .ok()
                    .and_then(|sel| doc.select(&sel).next())
                    .and_then(|el| el.value().attr("src"))
                    .map(|s| s.to_string())
            })
            .or_else(|| find_mp4_link(&doc, page_url));

        let video_url = video_url?;

        // Resolve relative URL
        let video_url = resolve_url(&video_url, page_url);

        // Extract thumbnail
        let thumbnail_url = extract_meta(&doc, "og:image")
            .or_else(|| extract_meta(&doc, "twitter:image"))
            .or_else(|| {
                Selector::parse("video[poster]")
                    .ok()
                    .and_then(|sel| doc.select(&sel).next())
                    .and_then(|el| el.value().attr("poster"))
                    .map(|s| s.to_string())
            })
            .map(|u| resolve_url(&u, page_url));

        Some(ScrapedWallpaper {
            title: truncate_title(title.map(|t| clean_title(&t)), 80),
            video_url,
            thumbnail_url,
            page_url: Some(page_url.to_string()),
            author: None,
            media_type: "video".to_string(),
        })
    }
}

#[async_trait::async_trait]
impl Scraper for DesktopHutScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        tracing::info!("scraping desktophut: {site_url}, batch={batch_size}");

        let listing_html = self.fetch_html(site_url).await?;
        let mut page_links = self.extract_listing_links(&listing_html, site_url);
        tracing::info!("found {} wallpaper page links", page_links.len());

        page_links.truncate(batch_size);

        let mut results = Vec::new();
        for link in &page_links {
            match self.fetch_html(link).await {
                Ok(html) => {
                    if let Some(w) = self.scrape_wallpaper_page(&html, link) {
                        tracing::debug!("scraped: {:?} from {link}", w.title);
                        results.push(w);
                    } else {
                        tracing::warn!("no media found on page: {link}");
                    }
                }
                Err(e) => {
                    tracing::warn!("failed to fetch {link}: {e}");
                }
            }
            // Small delay to be polite
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Ok(results)
    }
}

fn is_wallpaper_page_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    // Must not be a category/tag/page/pagination link
    if lower.contains("/category/")
        || lower.contains("/tag/")
        || lower.contains("/author/")
        || lower.contains("/page/")
        || lower.contains("?")
        || lower.contains("#")
    {
        return false;
    }
    // Must look like a slug page (not the home)
    let path = url::Url::parse(url)
        .ok()
        .map(|u| u.path().trim_end_matches('/').to_string())
        .unwrap_or_default();
    // At least has one path segment that looks like a slug
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.is_empty() {
        return false;
    }
    let slug = segments.last().unwrap_or(&"");
    slug.len() > 3 && slug.contains('-')
}

fn looks_like_video(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".ogv")
        || lower.ends_with(".mov")
        || lower.contains(".mp4?")
        || lower.contains(".webm?")
}

fn find_mp4_link(doc: &Html, base_url: &str) -> Option<String> {
    let sel = Selector::parse("a[href]").ok()?;
    for el in doc.select(&sel) {
        if let Some(href) = el.value().attr("href") {
            if looks_like_video(href) {
                return Some(resolve_url(href, base_url));
            }
        }
    }
    None
}

fn extract_meta(doc: &Html, property: &str) -> Option<String> {
    // Try <meta property="..."> and <meta name="...">
    let selectors = [
        format!("meta[property=\"{property}\"]"),
        format!("meta[name=\"{property}\"]"),
    ];
    for sel_str in &selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            if let Some(el) = doc.select(&sel).next() {
                let val = el
                    .value()
                    .attr("content")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                if val.is_some() {
                    return val;
                }
            }
        }
    }
    None
}

fn resolve_url(url: &str, base: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(resolved) = base_url.join(url) {
            return resolved.to_string();
        }
    }
    url.to_string()
}

fn clean_title(title: &str) -> String {
    // Remove common site suffixes like " - DesktopHut", " | Site Name"
    let t = title.trim();
    for sep in &[" - ", " | ", " – "] {
        if let Some(pos) = t.rfind(sep) {
            return t[..pos].trim().to_string();
        }
    }
    t.to_string()
}
