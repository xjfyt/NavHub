use super::{is_blocked_wallpaper_subject, truncate_title, ScrapedWallpaper, Scraper};
use anyhow::{Context, Result};
use scraper::{Html, Selector};

/// INFRA-7: DesktopHut 列表页提取链接用的 CSS 选择器集中在此,便于站点改版时
/// 单点维护,而不是散落在函数体内的硬编码字面量。按从最具体到最宽松排列,
/// 命中即停止尝试后续选择器。
const LISTING_LINK_SELECTORS: [&str; 8] = [
    "article a[href]",
    ".entry-title a[href]",
    ".post-title a[href]",
    "h2 a[href]",
    "h3 a[href]",
    ".thumbnail a[href]",
    ".item a[href]",
    "a.more-link[href]",
];

/// INFRA-7: 兜底选择器——当所有结构化选择器都没命中时,扫描全部 <a href>。
const LISTING_LINK_FALLBACK_SELECTOR: &str = "a[href]";

pub struct DesktopHutScraper {
    client: reqwest::Client,
}

impl DesktopHutScraper {
    pub fn new() -> Result<Self> {
        // INFRA-8: 构造失败向上传播,不再 unwrap_or_default 静默退化。
        let client = super::build_scraper_client(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )?;
        Ok(Self { client })
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

        // INFRA-7: 选择器集中到模块级常量 LISTING_LINK_SELECTORS。
        let base = url::Url::parse(base_url).ok();

        for sel_str in &LISTING_LINK_SELECTORS {
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
            if let Ok(sel) = Selector::parse(LISTING_LINK_FALLBACK_SELECTOR) {
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

        let title = title.map(|t| clean_title(&t));
        let subject = format!("{} {page_url}", title.as_deref().unwrap_or_default());
        if is_blocked_wallpaper_subject(&subject) {
            return None;
        }

        Some(ScrapedWallpaper {
            title: truncate_title(title, 80),
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

        // INFRA-7: 非空页面却 0 链接 => 选择器极可能因站点改版失效,告警以便运维察觉。
        if should_warn_breakage(!listing_html.trim().is_empty(), page_links.len()) {
            tracing::warn!(
                "desktophut listing page returned a non-empty body but 0 links were extracted \
                 from {site_url} — the site markup likely changed; review \
                 LISTING_LINK_SELECTORS in scraper/desktophut.rs"
            );
        }

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

/// INFRA-7: 判定一次列表页抓取是否疑似站点改版导致选择器失效。
/// 页面有 HTML 正文(非空)却一个链接都没提取出来,几乎一定意味着 DesktopHut
/// 改了页面结构,应当 warn 让运维注意;空页面(可能是网络/上游问题)或确实
/// 提取到 N>0 个链接都属正常,不告警。纯函数,便于单测。
fn should_warn_breakage(body_non_empty: bool, extracted_links: usize) -> bool {
    body_non_empty && extracted_links == 0
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

#[cfg(test)]
mod tests {
    use super::*;

    // INFRA-7: 站点改版告警判定。
    #[test]
    fn warns_on_non_empty_body_with_zero_links() {
        // 有正文却 0 链接 => 极可能选择器失效,应告警。
        assert!(should_warn_breakage(true, 0));
    }

    #[test]
    fn no_warn_on_empty_body() {
        // 空页面(上游/网络问题)不告警,避免噪声。
        assert!(!should_warn_breakage(false, 0));
    }

    #[test]
    fn no_warn_when_links_extracted() {
        // 正常提取到 N>0 个链接,不告警。
        assert!(!should_warn_breakage(true, 1));
        assert!(!should_warn_breakage(true, 25));
        // 即便 body 标记为空但拿到了链接(理论边界),也不应告警。
        assert!(!should_warn_breakage(false, 5));
    }

    #[test]
    fn listing_selectors_are_parseable() {
        // 集中后的选择器必须都能被 scraper 解析,避免常量里写错字面量。
        for sel in LISTING_LINK_SELECTORS.iter() {
            assert!(
                Selector::parse(sel).is_ok(),
                "selector failed to parse: {sel}"
            );
        }
        assert!(Selector::parse(LISTING_LINK_FALLBACK_SELECTOR).is_ok());
    }
}
