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
use std::time::Duration;

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

/// Probe a host through DNS and reject any address pointing at private / loopback /
/// link-local / multicast / reserved space, covering both IPv4 and IPv6.
/// `allow_private` opens a homelab escape hatch that still blocks loopback/multicast/unspecified.
async fn ensure_safe_target(host: &str, allow_private: bool) -> AppResult<()> {
    if host.eq_ignore_ascii_case("localhost") {
        return Err(AppError::BadRequest("invalid host".into()));
    }
    // If the host is itself an IP literal, validate it directly without DNS.
    if let Ok(ip) = host.parse::<IpAddr>() {
        return check_ip(ip, allow_private);
    }
    // Probe both v4 and v6 — port 0 yields all records.
    let iter = tokio::net::lookup_host((host, 0u16))
        .await
        .map_err(|e| AppError::BadRequest(format!("dns failure: {e}")))?;
    let mut saw_any = false;
    for addr in iter {
        saw_any = true;
        check_ip(addr.ip(), allow_private)?;
    }
    if !saw_any {
        return Err(AppError::BadRequest("dns: no records".into()));
    }
    Ok(())
}

fn check_ip(ip: IpAddr, allow_private: bool) -> AppResult<()> {
    if ip.is_loopback() || ip.is_multicast() || ip.is_unspecified() {
        return Err(AppError::BadRequest("invalid host IP".into()));
    }
    match ip {
        IpAddr::V4(v4) => {
            if v4.is_broadcast() || v4.is_documentation() {
                return Err(AppError::BadRequest("invalid host IP".into()));
            }
            if !allow_private && (v4.is_private() || v4.is_link_local()) {
                return Err(AppError::BadRequest("invalid host IP (private)".into()));
            }
        }
        IpAddr::V6(v6) => {
            // Reject IPv4-mapped (::ffff:0:0/96) so attackers can't smuggle a private V4.
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return check_ip(IpAddr::V4(mapped), allow_private);
            }
            let segs = v6.segments();
            // fe80::/10 link-local
            let link_local = (segs[0] & 0xffc0) == 0xfe80;
            // fc00::/7 unique-local
            let unique_local = (segs[0] & 0xfe00) == 0xfc00;
            if !allow_private && (link_local || unique_local) {
                return Err(AppError::BadRequest("invalid host IP (private)".into()));
            }
        }
    }
    Ok(())
}

pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(q): Query<FaviconSearchQuery>,
) -> AppResult<axum::Json<Vec<FaviconSearchCandidate>>> {
    let host = extract_host(&q.url).ok_or_else(|| AppError::BadRequest("invalid url".into()))?;
    let allow_private = state.cfg.app.tls_accept_invalid_certs;
    // Validate the user-supplied host BEFORE making any request, so a parse-only path
    // can't be used as an internal port scanner.
    ensure_safe_target(&host, allow_private).await?;

    let mut candidates = Vec::new();

    candidates.push(FaviconSearchCandidate {
        url: format!("/api/favicon?url={}&sz=128", urlencoding::encode(&q.url)),
        source: "智能抓取/生成".into(),
    });

    let mut url_with_scheme = q.url.clone();
    if !url_with_scheme.starts_with("http") {
        url_with_scheme = format!("https://{}", url_with_scheme);
    }

    if let Ok(resp) = state
        .favicon_client
        .get(&url_with_scheme)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        if let Ok(html) = resp.text().await {
            let document = scraper::Html::parse_document(&html);
            let selector = scraper::Selector::parse(
                "link[rel='apple-touch-icon'], link[rel='icon'], link[rel='shortcut icon']",
            )
            .unwrap();
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

    candidates.push(FaviconSearchCandidate {
        url: format!("https://{}/favicon.ico", host),
        source: "直接访问".into(),
    });
    candidates.push(FaviconSearchCandidate {
        url: format!("https://icons.duckduckgo.com/ip3/{}.ico", host),
        source: "DuckDuckGo".into(),
    });
    candidates.push(FaviconSearchCandidate {
        url: format!("https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{}&size=128", host),
        source: "Google".into(),
    });

    let mut seen = std::collections::HashSet::new();
    candidates.retain(|c| seen.insert(c.url.clone()));

    // Probe candidates concurrently with a hard cap; each probe revalidates SSRF for
    // its own host so a redirect or HTML-extracted href can't smuggle in a private target.
    let allow_private = state.cfg.app.tls_accept_invalid_certs;
    let sem = Arc::new(tokio::sync::Semaphore::new(8));
    let mut tasks = Vec::new();
    for c in candidates {
        let client = state.favicon_client.clone();
        let sem = sem.clone();
        tasks.push(tokio::spawn(async move {
            if c.url.starts_with('/') {
                return Some(c);
            }
            let _permit = sem.acquire_owned().await.ok()?;
            // Re-validate every candidate's resolved host.
            let cand_host = extract_host(&c.url)?;
            if ensure_safe_target(&cand_host, allow_private).await.is_err() {
                return None;
            }
            let resp = client
                .get(&c.url)
                .timeout(Duration::from_secs(3))
                .send()
                .await
                .ok()?;
            if !resp.status().is_success() {
                return None;
            }
            let ct = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if ct.starts_with("image/") || ct.contains("icon") || ct.contains("octet-stream") {
                Some(c)
            } else {
                None
            }
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
    let allow_private = state.cfg.app.tls_accept_invalid_certs;
    ensure_safe_target(&host, allow_private).await?;

    let cache_key = format!("favicon:{}:{}", q.sz, host);

    {
        let mut conn = state.redis.get().await?;
        let cached: Option<Vec<u8>> = conn.get(&cache_key).await.ok().flatten();
        if let Some(bytes) = cached {
            let mime = detect_mime(&bytes);
            return Ok(image_response(bytes, mime));
        }
    }

    let client = &state.favicon_client;
    let sz = q.sz;

    let direct_url = format!("https://{host}/favicon.ico");
    if let Some(bytes) = try_fetch(client, &direct_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(&state, &cache_key, bytes).await;
        }
    }

    try_remaining_strategies(client, &state, &cache_key, &host, sz).await
}

async fn try_remaining_strategies(
    client: &reqwest::Client,
    state: &Arc<AppState>,
    cache_key: &str,
    host: &str,
    sz: u16,
) -> AppResult<Response> {
    let ddg_url = format!("https://icons.duckduckgo.com/ip3/{host}.ico");
    if let Some(bytes) = try_fetch(client, &ddg_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    let google_url = format!(
        "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{host}&size={sz}"
    );
    if let Some(bytes) = try_fetch(client, &google_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    let http_url = format!("http://{host}/favicon.ico");
    if let Some(bytes) = try_fetch(client, &http_url).await {
        if is_valid_icon(&bytes) {
            return cache_and_return(state, cache_key, bytes).await;
        }
    }

    Ok(placeholder_response(host))
}

async fn try_fetch(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let resp = client
        .get(url)
        .timeout(Duration::from_secs(8))
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

fn is_valid_icon(bytes: &[u8]) -> bool {
    if bytes.len() < 64 {
        return false;
    }
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

fn placeholder_response(host: &str) -> Response {
    let letter = host
        .chars()
        .find(|c| c.is_ascii_alphabetic())
        .unwrap_or('?')
        .to_ascii_uppercase();
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
    parsed.host_str().map(|h| h.to_string())
}
