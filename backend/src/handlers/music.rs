use crate::{
    error::{AppError, AppResult},
    models::SessionUser,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::Redirect,
    Extension, Json,
};
use deadpool_redis::redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NeteaseSong {
    pub id: u64,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(rename = "picUrl", skip_serializing_if = "Option::is_none")]
    pub pic_url: Option<String>,
    #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResp {
    pub songs: Vec<NeteaseSong>,
}

pub async fn search(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<SessionUser>,
    Query(q): Query<SearchQuery>,
) -> AppResult<Json<SearchResp>> {
    let term = q.q.trim();
    if term.is_empty() {
        return Ok(Json(SearchResp { songs: vec![] }));
    }
    let limit = q.limit.unwrap_or(20).clamp(1, 50);

    let cache_key = format!("widget:music:search:{}:{}", limit, urlencoding::encode(term));
    if let Ok(mut conn) = state.redis.get().await {
        let cached: Option<String> = conn.get(&cache_key).await.unwrap_or(None);
        if let Some(s) = cached {
            if let Ok(v) = serde_json::from_str::<SearchResp>(&s) {
                return Ok(Json(v));
            }
        }
    }

    let songs = fetch_netease_search(&state.reqwest_client, term, limit).await.map_err(|e| {
        tracing::warn!("netease search failed: {e}");
        AppError::Internal(format!("netease: {e}"))
    })?;

    let resp = SearchResp { songs };
    if let Ok(payload) = serde_json::to_string(&resp) {
        if let Ok(mut conn) = state.redis.get().await {
            let _: Result<(), _> = conn.set_ex(&cache_key, payload, 3600).await;
        }
    }
    Ok(Json(resp))
}

pub async fn song(
    Extension(_user): Extension<SessionUser>,
    Path(id): Path<u64>,
) -> Redirect {
    Redirect::temporary(&format!(
        "https://music.163.com/song/media/outer/url?id={id}.mp3"
    ))
}

async fn fetch_netease_search(client: &reqwest::Client, q: &str, limit: u32) -> anyhow::Result<Vec<NeteaseSong>> {

    let form = [
        ("s", q.to_string()),
        ("type", "1".to_string()),
        ("limit", limit.to_string()),
        ("offset", "0".to_string()),
    ];

    let res = client
        .post("https://music.163.com/api/search/get")
        .header("Referer", "https://music.163.com")
        .header("Origin", "https://music.163.com")
        .header("Cookie", "appver=2.0.2; os=osx")
        .form(&form)
        .send()
        .await?;

    if !res.status().is_success() {
        anyhow::bail!("upstream status {}", res.status());
    }
    let v: serde_json::Value = res.json().await?;
    let arr = v
        .get("result")
        .and_then(|r| r.get("songs"))
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::with_capacity(arr.len());
    for s in arr {
        let id = s.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
        if id == 0 {
            continue;
        }
        let title = s
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let artist = s
            .get("artists")
            .and_then(|a| a.as_array())
            .and_then(|a| a.first())
            .and_then(|a| a.get("name"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let album = s
            .get("album")
            .and_then(|a| a.get("name"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let pic_url = s
            .get("album")
            .and_then(|a| a.get("picUrl"))
            .and_then(|x| x.as_str())
            .map(|s| s.replace("http://", "https://"));
        let duration_ms = s.get("duration").and_then(|x| x.as_u64());
        out.push(NeteaseSong {
            id,
            title,
            artist,
            album,
            pic_url,
            duration_ms,
        });
    }
    Ok(out)
}
