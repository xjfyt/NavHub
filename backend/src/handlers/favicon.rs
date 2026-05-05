use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::Response,
};
use deadpool_redis::redis::AsyncCommands;
use serde::Deserialize;
use std::net::IpAddr;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct FaviconQuery {
    pub url: String,
    #[serde(default = "default_size")]
    pub sz: u16,
}

#[derive(Debug, Deserialize)]
pub struct FaviconSearchQuery {
    pub url: String,
}

#[derive(serde::Serialize)]
pub struct FaviconSearchCandidate {
    pub url: String,
    pub source: String,
}

fn default_size() -> u16 {
    64
}

pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(q): Query<FaviconSearchQuery>,
) -> AppResult<axum::Json<Vec<FaviconSearchCandidate>>> {
    let host = extract_host(&q.url).unwrap_or_default();
    let mut candidates = Vec::new();

    candidates.push(FaviconSearchCandidate {
        url: format!("/api/favicon?url={}&sz=128", urlencoding::encode(&q.url)),
        source: "智能抓取/生成".into(),
    });

    // Strategy 1: Parse HTML
    let mut url_with_scheme = q.url.clone();
    if !url_with_scheme.starts_with("http") {
        url_with_scheme = format!("https://{}", url_with_scheme);
    }
    
    if let Ok(resp) = state.reqwest_client.get(&url_with_scheme).timeout(std::time::Duration::from_secs(5)).send().await {
        if let Ok(html) = resp.text().await {
            let document = scraper::Html::parse_document(&html);
            let selector = scraper::Selector::parse("link[rel='apple-touch-icon'], link[rel='icon'], link[rel='shortcut icon']").unwrap();
            for element in document.select(&selector) {
                if let Some(href) = element.value().attr("href") {
                    let full_url = if href.starts_with("http") {
                        href.to_string()
                    } else if href.starts_with("//") {
                        format!("https:{}", href)
                    } else if href.starts_with('/') {
                        let parsed = url::Url::parse(&url_with_scheme).ok();
                        if let Some(mut parsed) = parsed {
                            parsed.set_path(href);
                            parsed.to_string()
                        } else {
                            format!("https://{}{}", host, href)
                        }
                    } else {
                        format!("{}/{}", url_with_scheme.trim_end_matches('/'), href)
                    };
                    candidates.push(FaviconSearchCandidate {
                        url: full_url,
                        source: "HTML解析".into(),
                    });
                }
            }
        }
    }

    if !host.is_empty() {
        // Direct
        candidates.push(FaviconSearchCandidate {
            url: format!("https://{}/favicon.ico", host),
            source: "直接访问".into(),
        });
        
        // DuckDuckGo
        candidates.push(FaviconSearchCandidate {
            url: format!("https://icons.duckduckgo.com/ip3/{}.ico", host),
            source: "DuckDuckGo".into(),
        });
        
        // Google
        candidates.push(FaviconSearchCandidate {
            url: format!("https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{}&size=128", host),
            source: "Google".into(),
        });
    }

    // deduplicate
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|c| seen.insert(c.url.clone()));

    let client = state.reqwest_client.clone();
    let mut tasks = Vec::new();
    for c in candidates {
        let client = client.clone();
        tasks.push(tokio::spawn(async move {
            if c.url.starts_with('/') {
                return Some(c);
            }
            if let Ok(resp) = client.get(&c.url).timeout(std::time::Duration::from_secs(3)).send().await {
                if resp.status().is_success() {
                    let ct = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("");
                    if ct.starts_with("image/") || ct.contains("icon") || ct.contains("octet-stream") {
                        return Some(c);
                    }
                }
            }
            None
        }));
    }

    let mut valid_candidates = Vec::new();
    for task in tasks {
        if let Ok(Some(c)) = task.await {
            valid_candidates.push(c);
        }
    }

    Ok(axum::Json(valid_candidates))
}

pub async fn proxy(
    State(state): State<Arc<AppState>>,
    Query(q): Query<FaviconQuery>,
) -> AppResult<Response> {
    let host = extract_host(&q.url).ok_or_else(|| AppError::BadRequest("invalid url".into()))?;

    // SSRF guard — skipped when tls_accept_invalid_certs is true (internal/homelab deployment)
    let allow_private = state.cfg.app.tls_accept_invalid_certs;
    if !allow_private {
        if host == "localhost" {
            return Err(AppError::BadRequest("invalid host".into()));
        }
        if let Ok(mut addrs) = tokio::net::lookup_host(format!("{}:80", host)).await {
            for addr in addrs.by_ref() {
                let ip = addr.ip();
                if ip.is_loopback() || ip.is_multicast() || ip.is_unspecified() {
                    return Err(AppError::BadRequest("invalid host IP".into()));
                }
                if let IpAddr::V4(ipv4) = ip {
                    if ipv4.is_private() || ipv4.is_link_local() {
                        return Err(AppError::BadRequest("invalid host IP (private)".into()));
                    }
                }
            }
        }
    }

    let cache_key = format!("favicon:{}:{}", q.sz, host);

    // Try Redis cache first
    {
        let mut conn = state.redis.get().await?;
        let cached: Option<Vec<u8>> = conn.get(&cache_key).await.ok().flatten();
        if let Some(bytes) = cached {
            let mime = detect_mime(&bytes);
            return Ok(image_response(bytes, mime));
        }
    }

    let client = &state.reqwest_client;
    let sz = q.sz;

    // Strategy 1: direct /favicon.ico on the target (works for internal/private sites)
    let direct_url = format!("https://{host}/favicon.ico");
    if let Some(bytes) = try_fetch(client, &direct_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(&state, &cache_key, bytes).await;
        }
    }

    // Fallbacks
    try_remaining_strategies(client, &state, &cache_key, &host, sz).await
}

async fn try_remaining_strategies(
    client: &reqwest::Client,
    state: &Arc<AppState>,
    cache_key: &str,
    host: &str,
    sz: u16,
) -> AppResult<Response> {
    // Strategy 2: DuckDuckGo favicon CDN (reliable, not blocked in China)
    let ddg_url = format!("https://icons.duckduckgo.com/ip3/{host}.ico");
    if let Some(bytes) = try_fetch(client, &ddg_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    // Strategy 3: Google gstatic faviconV2 (works for well-known public domains)
    let google_url = format!(
        "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{host}&size={sz}"
    );
    if let Some(bytes) = try_fetch(client, &google_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    // Strategy 4: HTTP fallback for direct fetch (in case target only serves HTTP)
    let http_url = format!("http://{host}/favicon.ico");
    if let Some(bytes) = try_fetch(client, &http_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    // All strategies failed — return a fallback letter avatar so the UI doesn't break
    Ok(placeholder_response(host))
}

async fn try_fetch(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.bytes().await.ok().map(|b| b.to_vec())
}

async fn cache_and_return(
    state: &Arc<AppState>,
    cache_key: &str,
    bytes: Vec<u8>,
) -> AppResult<Response> {
    let mime = detect_mime(&bytes);
    if let Ok(mut conn) = state.redis.get().await {
        let _: () = conn
            .set_ex(cache_key, bytes.clone(), 60 * 60 * 24)
            .await
            .unwrap_or(());
    }
    Ok(image_response(bytes, mime))
}

/// Reject obviously invalid responses: too small, or an HTML error page.
fn is_valid_icon(bytes: &[u8]) -> bool {
    if bytes.len() < 64 {
        return false;
    }
    // Reject HTML responses (error pages)
    let prefix = &bytes[..bytes.len().min(16)];
    if prefix.starts_with(b"<!DOCTYPE") || prefix.starts_with(b"<html") || prefix.starts_with(b"<!") {
        return false;
    }
    true
}

fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(b"GIF") {
        "image/gif"
    } else if bytes.starts_with(b"\xff\xd8") {
        "image/jpeg"
    } else if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        "image/svg+xml"
    } else if bytes.len() > 4 && &bytes[..4] == b"RIFF" {
        "image/webp"
    } else {
        // ICO or unknown — browsers handle ICO fine as x-icon
        "image/x-icon"
    }
}

fn image_response(bytes: Vec<u8>, mime: &'static str) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
}

// Letter avatar SVG fallback
fn placeholder_response(host: &str) -> Response {
    let letter = host.chars().find(|c| c.is_ascii_alphabetic()).unwrap_or('?').to_ascii_uppercase();
    let hash = host.bytes().fold(0u32, |acc, b| acc.wrapping_add(b as u32));
    let colors = [
        "#E57373", "#F06292", "#BA68C8", "#9575CD", "#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
        "#4DB6AC", "#81C784", "#AED581", "#DCE775", "#FFF176", "#FFD54F", "#FFB74D", "#FF8A65",
    ];
    let color = colors[(hash as usize) % colors.len()];
    
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="{}"/><text x="50%" y="50%" font-family="sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">{}</text></svg>"##,
        color, letter
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/svg+xml")
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(svg))
        .unwrap()
}

fn extract_host(input: &str) -> Option<String> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    let with_scheme = if s.contains("://") {
        s.to_string()
    } else {
        format!("https://{s}")
    };
    let parsed = url::Url::parse(&with_scheme).ok()?;
    // Return host without port so cache keys are stable
    parsed.host_str().map(|h| h.to_string())
}
