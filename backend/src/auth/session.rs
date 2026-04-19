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
    format!(
        "{}={}; HttpOnly; Path=/; SameSite=Strict; Max-Age={}{}",
        COOKIE_NAME, sid, max_age, secure_attr
    )
}

pub fn clear_cookie(secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0{}",
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
