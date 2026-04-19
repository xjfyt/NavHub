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
use std::sync::Arc;
use std::net::IpAddr;

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
    
    // Check for SSRF via DNS resolution
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
    let cache_key = format!("favicon:{}:{}", q.sz, host);

    // Try Redis cache
    {
        let mut conn = state.redis.get().await?;
        let cached: Option<Vec<u8>> = conn.get(&cache_key).await.ok().flatten();
        if let Some(bytes) = cached {
            return Ok(image_response(bytes));
        }
    }

    let upstream = format!(
        "https://www.google.com/s2/favicons?domain={}&sz={}",
        urlencoding::encode(&host),
        q.sz
    );
    let resp = state.reqwest_client.get(&upstream).send().await.map_err(|e| {
        tracing::warn!("favicon fetch failed: {e}");
        AppError::Internal("favicon fetch failed".into())
    })?;
    if !resp.status().is_success() {
        return Err(AppError::NotFound);
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_vec();

    // Cache 24h
    {
        let mut conn = state.redis.get().await?;
        let _: () = conn
            .set_ex(&cache_key, bytes.clone(), 60 * 60 * 24)
            .await
            .unwrap_or(());
    }
    Ok(image_response(bytes))
}

fn image_response(bytes: Vec<u8>) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
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
    let url = url::Url::parse(&with_scheme).ok()?;
    url.host_str().map(|h| h.to_string())
}
