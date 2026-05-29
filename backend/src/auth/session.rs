use crate::{error::AppResult, state::AppState};
use deadpool_redis::redis::AsyncCommands;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

pub const COOKIE_NAME: &str = "nh_sid";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub user_id: Uuid,
    pub role: String,
    pub username: String,
    pub email: String,
    #[serde(default)]
    pub must_change_password: bool,
}

pub fn gen_session_id() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect()
}

pub async fn create_session(state: &Arc<AppState>, data: &SessionData) -> AppResult<String> {
    let sid = gen_session_id();
    let mut conn = state.redis.get().await?;
    let ttl = state.cfg.app.session_ttl_days * 24 * 3600;
    let payload = serde_json::to_string(data)?;
    let _: () = conn.set_ex(session_key(&sid), payload, ttl as u64).await?;
    let set_key = format!("user_sessions:{}", data.user_id);
    let _: () = conn.sadd(&set_key, &sid).await.unwrap_or(());
    let _: () = conn.expire(&set_key, ttl).await.unwrap_or(());
    Ok(sid)
}

pub async fn get_session(state: &Arc<AppState>, sid: &str) -> AppResult<Option<SessionData>> {
    let mut conn = state.redis.get().await?;
    let raw: Option<String> = conn.get(session_key(sid)).await?;
    match raw {
        Some(s) => Ok(Some(serde_json::from_str(&s)?)),
        None => Ok(None),
    }
}

pub async fn destroy_session(state: &Arc<AppState>, sid: &str) -> AppResult<()> {
    let mut conn = state.redis.get().await?;
    let _: () = conn.del(session_key(sid)).await?;
    Ok(())
}

pub async fn clear_all_user_sessions(state: &Arc<AppState>, uid: Uuid) -> AppResult<()> {
    let mut conn = state.redis.get().await?;
    let set_key = format!("user_sessions:{}", uid);
    let sids: Vec<String> = conn.smembers(&set_key).await.unwrap_or_default();
    for sid in sids {
        let _: () = conn.del::<_, ()>(session_key(&sid)).await.unwrap_or(());
    }
    let _: () = conn.del::<_, ()>(&set_key).await.unwrap_or(());
    Ok(())
}

fn session_key(sid: &str) -> String {
    format!("session:{}", sid)
}

pub fn build_cookie(sid: &str, ttl_days: i64, secure: bool) -> String {
    let max_age = ttl_days * 24 * 3600;
    let secure_attr = if secure { "; Secure" } else { "" };
    // SameSite=Lax: OAuth/SSO callback redirects back from a cross-site IdP
    // (e.g. Casdoor) as a top-level navigation; Strict would drop the session
    // cookie on the redirect chain and leave the user still unauthenticated.
    // Lax keeps CSRF protection for cross-site POSTs while letting the
    // post-callback navigation carry the cookie.
    format!(
        "{}={}; HttpOnly; Path=/; SameSite=Lax; Max-Age={}{}",
        COOKIE_NAME, sid, max_age, secure_attr
    )
}

pub fn clear_cookie(secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0{}",
        COOKIE_NAME, secure_attr
    )
}

pub fn extract_sid(headers: &axum::http::HeaderMap) -> Option<String> {
    let cookie_header = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let kv = part.trim();
        if let Some((k, v)) = kv.split_once('=') {
            if k == COOKIE_NAME {
                return Some(v.to_string());
            }
        }
    }
    None
}

pub fn is_https_public(state: &Arc<AppState>) -> bool {
    state.cfg.server.public_url.starts_with("https://")
}

/// AUTH-6: classify a configured `public_url` for the startup cookie-Secure
/// warning. We deliberately do NOT force `Secure` unconditionally (that would
/// break pure-http homelab/LAN deployments that have no TLS terminator), so
/// instead we fail loud at boot when the origin is a *public* http URL — there
/// the session cookie travels without `Secure` and SSO/auth is interceptable.
///
/// Returns `true` when the operator should be warned: scheme is http(s missing)
/// AND the host is not loopback / not a private-LAN address. https origins and
/// localhost / RFC1918 / CGNAT / link-local / unique-local hosts are considered
/// safe enough (LAN or properly-TLS'd) and produce no warning.
pub fn public_url_is_insecure_public(public_url: &str) -> bool {
    let trimmed = public_url.trim();
    // https → cookie carries Secure, nothing to warn about.
    if trimmed.starts_with("https://") {
        return false;
    }
    // Only http:// origins are candidates; anything else (empty, malformed,
    // unix socket, etc.) we don't second-guess here.
    let rest = match trimmed.strip_prefix("http://") {
        Some(r) => r,
        None => return false,
    };
    // Strip path/query/fragment, then userinfo, then port to isolate the host.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    let host = strip_port(host_port);
    if host.is_empty() {
        return false;
    }
    // A bare hostname (e.g. an intranet name like "navhub" or a public FQDN):
    // if it parses as an IP we can classify precisely; otherwise treat known
    // local names as safe and everything else (a real domain) as public.
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return !ip_is_local(&ip);
    }
    let lower = host.to_ascii_lowercase();
    let is_local_name = lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower.ends_with(".lan");
    !is_local_name
}

/// Strip a trailing `:port` from a host, leaving bracketed IPv6 literals intact.
fn strip_port(host_port: &str) -> &str {
    let s = host_port.trim();
    if let Some(rest) = s.strip_prefix('[') {
        // [::1]:8080 → ::1   ;   [::1] → ::1
        if let Some(end) = rest.find(']') {
            return &rest[..end];
        }
        return rest;
    }
    // IPv4 / hostname: only one colon means host:port; multiple colons would be
    // a bare (unbracketed) IPv6 which we leave alone.
    match s.rsplit_once(':') {
        Some((h, p)) if !h.contains(':') && p.chars().all(|c| c.is_ascii_digit()) => h,
        _ => s,
    }
}

/// True when an IP belongs to loopback / private-LAN / link-local / CGNAT /
/// unique-local space — i.e. not a public address that needs TLS.
fn ip_is_local(ip: &std::net::IpAddr) -> bool {
    use std::net::IpAddr;
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                // RFC 6598 carrier-grade NAT: 100.64.0.0/10
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 0x40)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // unique-local fc00::/7
                || (v6.segments()[0] & 0xFE00) == 0xFC00
                // link-local fe80::/10
                || (v6.segments()[0] & 0xFFC0) == 0xFE80
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_origin_never_warns() {
        assert!(!public_url_is_insecure_public("https://nav.example.com"));
        assert!(!public_url_is_insecure_public("https://192.0.2.1"));
        assert!(!public_url_is_insecure_public("https://localhost:8080"));
    }

    #[test]
    fn localhost_http_does_not_warn() {
        assert!(!public_url_is_insecure_public("http://localhost"));
        assert!(!public_url_is_insecure_public("http://localhost:3000"));
        assert!(!public_url_is_insecure_public("http://127.0.0.1:8080"));
        assert!(!public_url_is_insecure_public("http://[::1]:8080"));
        assert!(!public_url_is_insecure_public("http://box.local"));
    }

    #[test]
    fn private_lan_http_does_not_warn() {
        assert!(!public_url_is_insecure_public("http://192.168.1.10"));
        assert!(!public_url_is_insecure_public("http://10.0.0.5:8080"));
        assert!(!public_url_is_insecure_public("http://172.16.3.4"));
        // CGNAT and IPv6 ULA / link-local are LAN too.
        assert!(!public_url_is_insecure_public("http://100.64.1.1"));
        assert!(!public_url_is_insecure_public("http://[fd00::1]:8080"));
    }

    #[test]
    fn public_http_origin_warns() {
        assert!(public_url_is_insecure_public("http://nav.example.com"));
        assert!(public_url_is_insecure_public(
            "http://nav.example.com:8080/path"
        ));
        assert!(public_url_is_insecure_public("http://203.0.113.7"));
        assert!(public_url_is_insecure_public("http://8.8.8.8:80"));
    }

    #[test]
    fn malformed_or_empty_does_not_warn() {
        assert!(!public_url_is_insecure_public(""));
        assert!(!public_url_is_insecure_public("ftp://whatever"));
        assert!(!public_url_is_insecure_public("http://"));
    }
}
