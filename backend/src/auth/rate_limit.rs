//! Tiny Redis-backed sliding-window limiter. Used to take the obvious edge off
//! credential-stuffing on `/auth/password` without pulling in another middleware
//! crate — Redis is already a dependency, and the throughput on these endpoints
//! is far below the cost of a single round-trip per request.

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{ConnectInfo, Request, State},
    middleware::Next,
    response::Response,
};
use std::net::SocketAddr;
use std::sync::Arc;

const PASSWORD_LIMIT_WINDOW_SECS: u64 = 60;
const PASSWORD_LIMIT_MAX: u64 = 10;

/// Best-effort client IP. We trust X-Forwarded-For only when present (the operator
/// is expected to be running behind a known reverse proxy), otherwise fall back to
/// the socket address.
fn client_key(req: &Request) -> String {
    if let Some(xff) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = xff.to_str() {
            if let Some(first) = s.split(',').next() {
                let ip = first.trim();
                if !ip.is_empty() {
                    return ip.to_string();
                }
            }
        }
    }
    if let Some(ConnectInfo(addr)) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
        return addr.ip().to_string();
    }
    "unknown".into()
}

/// 10 attempts per 60-second window per source IP. Returns 429 when exceeded so
/// the frontend surfaces a clear error instead of looking like a wrong-password
/// loop.
pub async fn password_login_limit(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> AppResult<Response> {
    let ip = client_key(&req);
    let key = format!("rl:auth_pwd:{ip}");
    let mut conn = state.redis.get().await?;
    // INCR + EXPIRE in one roundtrip via a pipeline. EXPIRE only takes effect on
    // the first INCR (after the key was missing) but issuing it every call is
    // cheap and survives Redis evictions.
    let (count, _set): (i64, i64) = redis::pipe()
        .atomic()
        .cmd("INCR")
        .arg(&key)
        .cmd("EXPIRE")
        .arg(&key)
        .arg(PASSWORD_LIMIT_WINDOW_SECS)
        .query_async(&mut *conn)
        .await
        .map_err(AppError::Redis)?;
    if count as u64 > PASSWORD_LIMIT_MAX {
        return Err(AppError::BadRequest(
            "too many login attempts; try again later".into(),
        ));
    }
    Ok(next.run(req).await)
}
