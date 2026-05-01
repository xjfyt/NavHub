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

fn default_size() -> u16 {
    64
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
            cache_and_return(&state, &cache_key, bytes).await
        } else {
            try_remaining_strategies(client, &state, &cache_key, &host, sz).await
        }
    } else {
        try_remaining_strategies(client, &state, &cache_key, &host, sz).await
    }
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

    // All strategies failed — return a transparent placeholder so the UI doesn't break
    Ok(placeholder_response())
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

// 1×1 transparent PNG as fallback so img tags don't show broken icons
fn placeholder_response() -> Response {
    const TRANSPARENT_1X1_PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
    ];
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(TRANSPARENT_1X1_PNG))
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
