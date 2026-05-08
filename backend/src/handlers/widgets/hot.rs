use crate::{error::AppResult, models::SessionUser, state::AppState};
use axum::{
    extract::{Query, State},
    Extension, Json,
};
use deadpool_redis::redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct HotQuery {
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HotItem {
    pub title: String,
    pub heat: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

pub async fn hot(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<SessionUser>,
    Query(q): Query<HotQuery>,
) -> AppResult<Json<Vec<HotItem>>> {
    let source = q.source.as_deref().unwrap_or("weibo");
    let key = format!("widget:hot:{source}");
    if let Ok(mut conn) = state.redis.get().await {
        let cached: Option<String> = conn.get(&key).await.unwrap_or(None);
        if let Some(c) = cached {
            if let Ok(v) = serde_json::from_str::<Vec<HotItem>>(&c) {
                return Ok(Json(v));
            }
        }
    }

    let list = match source {
        "zhihu" => fetch_zhihu(&state.reqwest_client).await,
        "bilibili" => fetch_bilibili(&state.reqwest_client).await,
        "juejin" => fetch_juejin(&state.reqwest_client).await,
        _ => fetch_weibo(&state.reqwest_client).await,
    };
    let list = list.unwrap_or_else(|e| {
        tracing::warn!("hot {source} failed: {e}");
        static_hot()
    });

    if let Ok(payload) = serde_json::to_string(&list) {
        if let Ok(mut conn) = state.redis.get().await {
            let _: Result<(), _> = conn.set_ex(&key, payload, 600).await;
        }
    }
    Ok(Json(list))
}

fn static_hot() -> Vec<HotItem> {
    vec![
        HotItem {
            title: "（接口暂不可用）GPT-5 发布 · 上下文推理能力大幅提升".into(),
            heat: "8.2M".into(),
            url: None,
        },
        HotItem {
            title: "（接口暂不可用）苹果公布 M5 芯片".into(),
            heat: "5.4M".into(),
            url: None,
        },
        HotItem {
            title: "（接口暂不可用）国内首个开源 RAG 框架突破 10w star".into(),
            heat: "3.1M".into(),
            url: None,
        },
    ]
}

fn format_heat(n: i64) -> String {
    if n >= 10_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 10_000 {
        format!("{:.1}万", n as f64 / 10_000.0)
    } else {
        n.to_string()
    }
}

async fn fetch_weibo(client: &reqwest::Client) -> anyhow::Result<Vec<HotItem>> {
    let resp: serde_json::Value = client
        .get("https://weibo.com/ajax/side/hotSearch")
        .header("Referer", "https://weibo.com/")
        .send()
        .await?
        .json()
        .await?;
    let arr = resp
        .pointer("/data/realtime")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("unexpected weibo payload"))?;
    let items: Vec<HotItem> = arr
        .iter()
        .take(10)
        .filter_map(|it| {
            let title = it.get("word")?.as_str()?.to_string();
            let heat = it
                .get("num")
                .and_then(|n| n.as_i64())
                .map(format_heat)
                .unwrap_or_default();
            let q = urlencoding::encode(&title);
            let url = format!("https://s.weibo.com/weibo?q=%23{}%23", q);
            Some(HotItem {
                title,
                heat,
                url: Some(url),
            })
        })
        .collect();
    if items.is_empty() {
        anyhow::bail!("empty items");
    }
    Ok(items)
}

async fn fetch_zhihu(client: &reqwest::Client) -> anyhow::Result<Vec<HotItem>> {
    let resp: serde_json::Value = client
        .get("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10&desktop=true")
        .send()
        .await?
        .json()
        .await?;
    let arr = resp
        .get("data")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("unexpected zhihu payload"))?;
    let items: Vec<HotItem> = arr
        .iter()
        .filter_map(|it| {
            let title = it
                .pointer("/target/title")
                .and_then(|v| v.as_str())?
                .to_string();
            let heat = it
                .get("detail_text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let qid = it.pointer("/target/id").and_then(|v| v.as_u64()).or_else(|| {
                it.pointer("/target/id")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
            });
            let url = qid.map(|q| format!("https://www.zhihu.com/question/{}", q));
            Some(HotItem { title, heat, url })
        })
        .collect();
    if items.is_empty() {
        anyhow::bail!("empty items");
    }
    Ok(items)
}

async fn fetch_bilibili(client: &reqwest::Client) -> anyhow::Result<Vec<HotItem>> {
    let resp: serde_json::Value = client
        .get("https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1")
        .send()
        .await?
        .json()
        .await?;
    let arr = resp
        .pointer("/data/list")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("unexpected bilibili payload"))?;
    let items: Vec<HotItem> = arr
        .iter()
        .take(10)
        .filter_map(|it| {
            let title = it.get("title")?.as_str()?.to_string();
            let views = it.pointer("/stat/view").and_then(|v| v.as_i64()).unwrap_or(0);
            let heat = if views >= 10_000_000 {
                format!("{:.1}M 播放", views as f64 / 1_000_000.0)
            } else if views >= 10_000 {
                format!("{:.1}万 播放", views as f64 / 10_000.0)
            } else {
                format!("{} 播放", views)
            };
            let url = it
                .get("bvid")
                .and_then(|v| v.as_str())
                .map(|bv| format!("https://www.bilibili.com/video/{}", bv));
            Some(HotItem { title, heat, url })
        })
        .collect();
    if items.is_empty() {
        anyhow::bail!("empty items");
    }
    Ok(items)
}

async fn fetch_juejin(client: &reqwest::Client) -> anyhow::Result<Vec<HotItem>> {
    let body = serde_json::json!({"category_id": "1", "type": "hot", "id_type": 2});
    let resp: serde_json::Value = client
        .post("https://api.juejin.cn/content_api/v1/content/article_rank")
        .json(&body)
        .send()
        .await?
        .json()
        .await?;
    let arr = resp
        .get("data")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("unexpected juejin payload"))?;
    let items: Vec<HotItem> = arr
        .iter()
        .take(10)
        .filter_map(|it| {
            let title = it
                .pointer("/content/title")
                .and_then(|v| v.as_str())?
                .to_string();
            let hot_val = it
                .pointer("/content_counter/hot_rank")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let heat = if hot_val > 0 {
                format!("{}°", hot_val)
            } else {
                "".into()
            };
            let id = it
                .pointer("/content/content_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let url = id.map(|i| format!("https://juejin.cn/post/{}", i));
            Some(HotItem { title, heat, url })
        })
        .collect();
    if items.is_empty() {
        anyhow::bail!("empty items");
    }
    Ok(items)
}
