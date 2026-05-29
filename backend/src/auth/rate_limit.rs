//! Tiny Redis-backed sliding-window limiter. Used to take the obvious edge off
//! credential-stuffing on `/auth/password` (and the SSO start endpoint) without
//! pulling in another middleware crate — Redis is already a dependency, and the
//! throughput on these endpoints is far below the cost of a single round-trip
//! per request.

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{ConnectInfo, Request, State},
    middleware::Next,
    response::Response,
};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;

const PASSWORD_LIMIT_WINDOW_SECS: u64 = 60;
const PASSWORD_LIMIT_MAX: u64 = 10;

/// AUTH-4: per-account (per-username/identity) attempt cap. Independent of the
/// per-IP cap so an attacker rotating source IPs (or coming through a trusted
/// proxy that collapses many clients to one XFF) still can't brute one account.
const ACCOUNT_LIMIT_WINDOW_SECS: u64 = 300;
const ACCOUNT_LIMIT_MAX: u64 = 10;

/// AUTH-4: is the direct socket peer one of the configured trusted reverse
/// proxies? Only then may we believe an `X-Forwarded-For` header. Entries may be
/// a bare IP (`10.0.0.1`) or a CIDR (`10.0.0.0/8`). An empty list trusts nobody.
pub fn peer_is_trusted(peer: IpAddr, trusted: &[String]) -> bool {
    let peer = normalize_ip(peer);
    trusted.iter().any(|entry| match parse_cidr(entry.trim()) {
        Some((net, prefix)) => ip_in_cidr(peer, net, prefix),
        None => false,
    })
}

/// AUTH-4: resolve the real client IP for rate-limiting. If the socket peer is a
/// trusted proxy AND an XFF header is present, take the *first* (left-most,
/// original-client) entry of XFF; otherwise ignore XFF entirely and use the
/// socket peer. A spoofed XFF from an untrusted peer is therefore powerless.
pub fn resolve_client_ip(peer: IpAddr, xff: Option<&str>, trusted: &[String]) -> IpAddr {
    if peer_is_trusted(peer, trusted) {
        if let Some(raw) = xff {
            if let Some(first) = raw.split(',').next() {
                if let Ok(ip) = first.trim().parse::<IpAddr>() {
                    return ip;
                }
            }
        }
    }
    peer
}

/// Map IPv4-mapped IPv6 (`::ffff:a.b.c.d`) down to its IPv4 form so a CIDR like
/// `10.0.0.0/8` matches regardless of how the peer was presented.
fn normalize_ip(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        other => other,
    }
}

/// Parse `"1.2.3.4"`, `"1.2.3.0/24"`, `"::1"`, or `"fd00::/8"` into (network, prefix).
/// A bare IP becomes a host route (/32 or /128).
fn parse_cidr(s: &str) -> Option<(IpAddr, u8)> {
    if s.is_empty() {
        return None;
    }
    let (addr_part, prefix_part) = match s.split_once('/') {
        Some((a, p)) => (a, Some(p)),
        None => (s, None),
    };
    let ip: IpAddr = addr_part.trim().parse().ok()?;
    let ip = normalize_ip(ip);
    let max = match ip {
        IpAddr::V4(_) => 32u8,
        IpAddr::V6(_) => 128u8,
    };
    let prefix = match prefix_part {
        Some(p) => {
            let n: u8 = p.trim().parse().ok()?;
            if n > max {
                return None;
            }
            n
        }
        None => max,
    };
    Some((ip, prefix))
}

/// Does `ip` fall inside `network/prefix`? Both must be the same family.
fn ip_in_cidr(ip: IpAddr, network: IpAddr, prefix: u8) -> bool {
    match (ip, network) {
        (IpAddr::V4(ip), IpAddr::V4(net)) => {
            v4_in(ip, net, prefix)
        }
        (IpAddr::V6(ip), IpAddr::V6(net)) => {
            v6_in(ip, net, prefix)
        }
        _ => false,
    }
}

fn v4_in(ip: Ipv4Addr, net: Ipv4Addr, prefix: u8) -> bool {
    if prefix == 0 {
        return true;
    }
    let mask: u32 = u32::MAX.checked_shl(32 - prefix as u32).unwrap_or(0);
    (u32::from(ip) & mask) == (u32::from(net) & mask)
}

fn v6_in(ip: Ipv6Addr, net: Ipv6Addr, prefix: u8) -> bool {
    if prefix == 0 {
        return true;
    }
    let mask: u128 = u128::MAX.checked_shl(128 - prefix as u32).unwrap_or(0);
    (u128::from(ip) & mask) == (u128::from(net) & mask)
}

/// Best-effort client IP honoring the trusted-proxy policy (AUTH-4).
fn client_ip(req: &Request, state: &Arc<AppState>) -> String {
    let peer = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip());
    let xff = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok());
    match peer {
        Some(peer) => resolve_client_ip(peer, xff, &state.cfg.server.trusted_proxies).to_string(),
        // No peer info at all (shouldn't happen with into_make_service_with_connect_info,
        // but be conservative): collapse to a single bucket rather than trusting XFF.
        None => "unknown".into(),
    }
}

/// Shared sliding-window INCR/EXPIRE against a Redis key. Returns Err(429-ish
/// BadRequest) once `max` is exceeded within `window`.
async fn bump_and_check(
    state: &Arc<AppState>,
    key: &str,
    window: u64,
    max: u64,
) -> AppResult<()> {
    let mut conn = state.redis.get().await?;
    // INCR + EXPIRE in one roundtrip via a pipeline. EXPIRE only takes effect on
    // the first INCR (after the key was missing) but issuing it every call is
    // cheap and survives Redis evictions.
    let (count, _set): (i64, i64) = redis::pipe()
        .atomic()
        .cmd("INCR")
        .arg(key)
        .cmd("EXPIRE")
        .arg(key)
        .arg(window)
        .query_async(&mut *conn)
        .await
        .map_err(AppError::Redis)?;
    if count as u64 > max {
        return Err(AppError::BadRequest(
            "too many login attempts; try again later".into(),
        ));
    }
    Ok(())
}

/// AUTH-4: per-account attempt cap. Call from the password handler once the
/// target username/identity is known. Normalizes the identity so `Alice` and
/// `alice` share a bucket.
pub async fn check_account_limit(state: &Arc<AppState>, identity: &str) -> AppResult<()> {
    let ident = identity.trim().to_ascii_lowercase();
    if ident.is_empty() {
        return Ok(());
    }
    let key = format!("rl:auth_acct:{ident}");
    bump_and_check(state, &key, ACCOUNT_LIMIT_WINDOW_SECS, ACCOUNT_LIMIT_MAX).await
}

/// 10 attempts per 60-second window per *real* source IP (honoring the trusted
/// proxy allowlist for XFF). Returns 429 when exceeded so the frontend surfaces
/// a clear error instead of looking like a wrong-password loop. Applied to both
/// the password login and the SSO start endpoint (AUTH-4).
pub async fn password_login_limit(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> AppResult<Response> {
    let ip = client_ip(&req, &state);
    let key = format!("rl:auth_pwd:{ip}");
    bump_and_check(&state, &key, PASSWORD_LIMIT_WINDOW_SECS, PASSWORD_LIMIT_MAX).await?;
    Ok(next.run(req).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn xff_ignored_when_peer_not_trusted() {
        // empty allowlist => never trust XFF
        let trusted: Vec<String> = vec![];
        let got = resolve_client_ip(ip("203.0.113.9"), Some("1.2.3.4"), &trusted);
        assert_eq!(got, ip("203.0.113.9"));

        // peer not in a non-empty allowlist => still ignore XFF
        let trusted = vec!["10.0.0.0/8".to_string()];
        let got = resolve_client_ip(ip("203.0.113.9"), Some("1.2.3.4"), &trusted);
        assert_eq!(got, ip("203.0.113.9"));
    }

    #[test]
    fn xff_honored_when_peer_trusted() {
        let trusted = vec!["10.0.0.0/8".to_string()];
        let got = resolve_client_ip(ip("10.1.2.3"), Some("1.2.3.4, 10.1.2.3"), &trusted);
        assert_eq!(got, ip("1.2.3.4"));

        // single-IP entry (host route) also works
        let trusted = vec!["192.168.0.5".to_string()];
        let got = resolve_client_ip(ip("192.168.0.5"), Some("8.8.8.8"), &trusted);
        assert_eq!(got, ip("8.8.8.8"));
    }

    #[test]
    fn trusted_peer_but_no_xff_uses_peer() {
        let trusted = vec!["10.0.0.0/8".to_string()];
        let got = resolve_client_ip(ip("10.1.2.3"), None, &trusted);
        assert_eq!(got, ip("10.1.2.3"));
    }

    #[test]
    fn trusted_peer_with_garbage_xff_falls_back_to_peer() {
        let trusted = vec!["10.0.0.0/8".to_string()];
        let got = resolve_client_ip(ip("10.1.2.3"), Some("not-an-ip"), &trusted);
        assert_eq!(got, ip("10.1.2.3"));
    }

    #[test]
    fn peer_is_trusted_matches_cidr_and_host() {
        assert!(peer_is_trusted(ip("10.255.0.1"), &["10.0.0.0/8".to_string()]));
        assert!(!peer_is_trusted(ip("11.0.0.1"), &["10.0.0.0/8".to_string()]));
        assert!(peer_is_trusted(ip("127.0.0.1"), &["127.0.0.1".to_string()]));
        assert!(!peer_is_trusted(ip("127.0.0.2"), &["127.0.0.1".to_string()]));
        // IPv4-mapped IPv6 peer matches an IPv4 CIDR.
        assert!(peer_is_trusted(ip("::ffff:10.0.0.1"), &["10.0.0.0/8".to_string()]));
        // IPv6 CIDR
        assert!(peer_is_trusted(ip("fd00::5"), &["fd00::/8".to_string()]));
        assert!(!peer_is_trusted(ip("fe80::1"), &["fd00::/8".to_string()]));
    }

    #[test]
    fn empty_allowlist_trusts_nobody() {
        assert!(!peer_is_trusted(ip("10.0.0.1"), &[]));
        assert!(!peer_is_trusted(ip("127.0.0.1"), &[]));
    }

    #[test]
    fn parse_cidr_rejects_bad_input() {
        assert!(parse_cidr("").is_none());
        assert!(parse_cidr("nonsense").is_none());
        assert!(parse_cidr("10.0.0.0/33").is_none());
        assert!(parse_cidr("fd00::/129").is_none());
        assert_eq!(parse_cidr("1.2.3.4"), Some((ip("1.2.3.4"), 32)));
        assert_eq!(parse_cidr("1.2.3.0/24"), Some((ip("1.2.3.0"), 24)));
    }
}
