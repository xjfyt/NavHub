use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
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
    DEFAULT_ICON_SIZE
}

/// INFRA-5: 允许的图标尺寸白名单。请求里的 `sz` 直接拼进上游 URL,
/// 不能让调用方传入任意值(放大攻击面 / 缓存键被任意撑开 / 上游被滥用)。
const ALLOWED_ICON_SIZES: [u16; 5] = [16, 32, 64, 128, 256];
const DEFAULT_ICON_SIZE: u16 = 64;

/// INFRA-5: 把任意请求尺寸收敛到白名单内的安全值。
/// - 命中白名单:原样保留。
/// - 落在白名单范围内但不在集合里:吸附到最接近的允许值(平手向上取)。
/// - 过小(<最小允许值)或过大(>最大允许值)等离谱取值:吸附到边界值,
///   不直接拒绝以保证 favicon 始终可返回(失败开放,返回占位图也比报错好)。
fn snap_icon_size(requested: u16) -> u16 {
    if ALLOWED_ICON_SIZES.contains(&requested) {
        return requested;
    }
    let min = ALLOWED_ICON_SIZES[0];
    let max = ALLOWED_ICON_SIZES[ALLOWED_ICON_SIZES.len() - 1];
    if requested <= min {
        return min;
    }
    if requested >= max {
        return max;
    }
    // 处于 (min, max) 之间但不命中:取绝对差最小的允许值,平手时取较大者。
    ALLOWED_ICON_SIZES
        .iter()
        .copied()
        .min_by_key(|&s| {
            let diff = (s as i32 - requested as i32).unsigned_abs();
            // 平手时偏向更大的尺寸:用 (diff, 反向尺寸) 排序键。
            (diff, u16::MAX - s)
        })
        .unwrap_or(DEFAULT_ICON_SIZE)
}

/// Probe a host through DNS and reject any address pointing at private / loopback /
/// link-local / multicast / reserved space, covering both IPv4 and IPv6.
/// `allow_private` opens a homelab escape hatch that still blocks loopback/multicast/unspecified.
pub(crate) async fn ensure_safe_target(host: &str, allow_private: bool) -> AppResult<()> {
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
            // link-local(169.254/16,含云元数据 169.254.169.254)始终拒绝,
            // 不受 allow_private 影响——homelab 例外只针对 RFC1918 私网。
            if v4.is_link_local() {
                return Err(AppError::BadRequest("invalid host IP (link-local)".into()));
            }
            if !allow_private && v4.is_private() {
                return Err(AppError::BadRequest("invalid host IP (private)".into()));
            }
        }
        IpAddr::V6(v6) => {
            // Reject IPv4-mapped (::ffff:0:0/96) so attackers can't smuggle a private V4.
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return check_ip(IpAddr::V4(mapped), allow_private);
            }
            let segs = v6.segments();
            // fe80::/10 link-local — 始终拒绝
            let link_local = (segs[0] & 0xffc0) == 0xfe80;
            // fc00::/7 unique-local — 视作私网,受 allow_private 控制
            let unique_local = (segs[0] & 0xfe00) == 0xfc00;
            if link_local {
                return Err(AppError::BadRequest("invalid host IP (link-local)".into()));
            }
            if !allow_private && unique_local {
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
    let allow_private = state.cfg.app.favicon_allow_private_targets;
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
        .lenient_client
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
    let allow_private = state.cfg.app.favicon_allow_private_targets;
    let sem = Arc::new(tokio::sync::Semaphore::new(8));
    let mut tasks = Vec::new();
    for c in candidates {
        let client = state.lenient_client.clone();
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
    let allow_private = state.cfg.app.favicon_allow_private_targets;
    ensure_safe_target(&host, allow_private).await?;

    // INFRA-5: 把请求尺寸收敛到白名单,避免任意值拼进上游 URL / 撑爆缓存键空间。
    let sz = snap_icon_size(q.sz);
    let cache_key = format!("favicon:{}:{}", sz, host);

    {
        let mut conn = state.redis.get().await?;
        let cached: Option<Vec<u8>> = conn.get(&cache_key).await.ok().flatten();
        if let Some(bytes) = cached {
            let mime = detect_mime(&bytes);
            return Ok(image_response(bytes, mime));
        }
    }

    let client = &state.lenient_client;

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

/// 单个图标的体积上限。SEC-6: 无 Content-Length 或谎报长度的流式响应不能无限缓冲。
const MAX_ICON_BYTES: usize = 3 * 1024 * 1024;

/// 读取响应体,累计超过 `max` 立即放弃,避免内存被超大/无限流撑爆。
async fn read_capped(resp: reqwest::Response, max: usize) -> Option<Vec<u8>> {
    use futures::StreamExt;
    if let Some(len) = resp.content_length() {
        if len > max as u64 {
            return None;
        }
    }
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.ok()?;
        if buf.len() + chunk.len() > max {
            return None;
        }
        buf.extend_from_slice(&chunk);
    }
    Some(buf)
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
    read_capped(resp, MAX_ICON_BYTES).await
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

/// INFRA-9: 用真实文件魔数(magic bytes)校验下载到的图标确实是图片,
/// 而不是仅凭 content-type/长度这种可被上游谎报的弱信号。
/// - 二进制图片(png/jpeg/gif/webp/ico/bmp 等):交给 `infer` 按魔数识别。
/// - SVG:本质是 text/xml,`infer` 不会识别,这里显式按文本特征判定。
/// - HTML 错误页 / 任意垃圾字节:一律拒绝。
fn is_valid_icon(bytes: &[u8]) -> bool {
    if bytes.len() < 4 {
        return false;
    }
    // 二进制图片:魔数命中即接受(infer 的 is_image 覆盖 png/jpeg/gif/webp/ico/bmp/tiff 等)。
    if infer::is_image(bytes) {
        return true;
    }
    // SVG / XML 文本:infer 识别不了文本格式,显式处理。
    is_svg_bytes(bytes)
}

/// INFRA-9: SVG 是文本(text/xml),没有二进制魔数,显式按文本特征识别。
/// 跳过 UTF-8 BOM 和前导空白后,要么直接是 `<svg`,要么是 `<?xml` 声明后跟 svg 根。
fn is_svg_bytes(bytes: &[u8]) -> bool {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let trimmed = trim_ascii_ws_start(bytes);
    if trimmed.starts_with(b"<svg") {
        return true;
    }
    if trimmed.starts_with(b"<?xml") {
        // XML 声明开头:在前面一段内容里找 "<svg",避免把任意 XML 当成图标。
        let scan_len = trimmed.len().min(512);
        return find_subslice(&trimmed[..scan_len], b"<svg").is_some();
    }
    false
}

fn trim_ascii_ws_start(mut bytes: &[u8]) -> &[u8] {
    while let [first, rest @ ..] = bytes {
        if first.is_ascii_whitespace() {
            bytes = rest;
        } else {
            break;
        }
    }
    bytes
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
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
    // INFRA-3: 用 IntoResponse 元组构造而非 Response::builder().unwrap();
    // 后者在 header 非法时会 panic。这里改为不可失败的构造方式。
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        Body::from(bytes),
    )
        .into_response()
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

    // INFRA-3: 同上,避免 Response::builder().unwrap() 的 panic 路径。
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/svg+xml"),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        Body::from(svg),
    )
        .into_response()
}

pub(crate) fn extract_host(input: &str) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_loopback_even_when_private_allowed() {
        assert!(check_ip("127.0.0.1".parse().unwrap(), true).is_err());
        assert!(check_ip("::1".parse().unwrap(), true).is_err());
    }

    #[test]
    fn rejects_private_and_link_local_by_default() {
        assert!(check_ip("10.0.0.5".parse().unwrap(), false).is_err());
        assert!(check_ip("192.168.1.1".parse().unwrap(), false).is_err());
        assert!(check_ip("172.16.0.1".parse().unwrap(), false).is_err());
    }

    #[test]
    fn allows_rfc1918_private_only_when_enabled() {
        assert!(check_ip("10.0.0.5".parse().unwrap(), true).is_ok());
        assert!(check_ip("192.168.1.1".parse().unwrap(), true).is_ok());
    }

    #[test]
    fn cloud_metadata_link_local_blocked_even_when_private_allowed() {
        // SEC-4/5: 169.254.169.254 等 link-local 始终拒绝,即便开启 allow_private。
        assert!(check_ip("169.254.169.254".parse().unwrap(), true).is_err());
        assert!(check_ip("169.254.0.1".parse().unwrap(), false).is_err());
    }

    #[test]
    fn rejects_ipv4_mapped_private_in_ipv6() {
        let ip: IpAddr = "::ffff:10.0.0.1".parse().unwrap();
        assert!(check_ip(ip, false).is_err());
    }

    #[test]
    fn allows_public_ip() {
        assert!(check_ip("1.1.1.1".parse().unwrap(), false).is_ok());
        assert!(check_ip("8.8.8.8".parse().unwrap(), false).is_ok());
    }

    // INFRA-5: 尺寸白名单收敛。
    #[test]
    fn snap_size_keeps_whitelisted_values() {
        for s in [16u16, 32, 64, 128, 256] {
            assert_eq!(snap_icon_size(s), s);
        }
    }

    #[test]
    fn snap_size_snaps_to_nearest_in_range() {
        // 介于允许值之间:吸附到最接近的允许值。
        assert_eq!(snap_icon_size(20), 16); // 距 16 差 4, 距 32 差 12
        assert_eq!(snap_icon_size(48), 64); // 平手(距 32/64 各 16)向上取 64
        assert_eq!(snap_icon_size(100), 128); // 距 64 差 36, 距 128 差 28
        assert_eq!(snap_icon_size(33), 32);
    }

    #[test]
    fn snap_size_clamps_absurd_values() {
        // 过小 / 过大都吸附到边界,绝不放任意值进上游 URL。
        assert_eq!(snap_icon_size(0), 16);
        assert_eq!(snap_icon_size(1), 16);
        assert_eq!(snap_icon_size(15), 16);
        assert_eq!(snap_icon_size(257), 256);
        assert_eq!(snap_icon_size(9999), 256);
        assert_eq!(snap_icon_size(u16::MAX), 256);
    }

    // INFRA-9: 用魔数校验真实图片。
    #[test]
    fn valid_icon_accepts_png_magic() {
        // PNG 签名 + 一点 IHDR 填充。
        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0u8; 16]);
        assert!(is_valid_icon(&png));
    }

    #[test]
    fn valid_icon_accepts_gif_jpeg_ico_webp() {
        // GIF89a
        let mut gif = b"GIF89a".to_vec();
        gif.extend_from_slice(&[0u8; 8]);
        assert!(is_valid_icon(&gif));
        // JPEG SOI + APP0
        assert!(is_valid_icon(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]));
        // ICO: 00 00 01 00
        assert!(is_valid_icon(&[0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0, 0]));
        // WEBP: RIFF....WEBP
        let webp = [
            b'R', b'I', b'F', b'F', 0x1A, 0, 0, 0, b'W', b'E', b'B', b'P', b'V', b'P', b'8', b' ',
        ];
        assert!(is_valid_icon(&webp));
    }

    #[test]
    fn valid_icon_accepts_svg_text() {
        assert!(is_valid_icon(br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#));
        assert!(is_valid_icon(
            br#"<?xml version="1.0"?><svg width="16"></svg>"#
        ));
        // 带 BOM + 前导空白
        assert!(is_valid_icon(b"\xEF\xBB\xBF  \n<svg></svg>"));
    }

    #[test]
    fn valid_icon_rejects_html_and_garbage() {
        assert!(!is_valid_icon(
            b"<!DOCTYPE html><html><body>404</body></html>"
        ));
        assert!(!is_valid_icon(b"<html><head></head></html>"));
        assert!(!is_valid_icon(
            b"not an image at all, just plain text bytes here"
        ));
        // 太短
        assert!(!is_valid_icon(b"ab"));
        // 普通 XML 但不是 svg
        assert!(!is_valid_icon(
            br#"<?xml version="1.0"?><rss><channel></channel></rss>"#
        ));
    }
}
