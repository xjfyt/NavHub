use crate::{
    error::{AppError, AppResult},
    handlers::workspace::ensure_prefs,
    models::{CustomEngineCreate, PreferencesView, PrefsPatch, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

pub async fn get_prefs(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<PreferencesView>> {
    let p = ensure_prefs(&state, user.id).await?;
    Ok(Json(p.into()))
}

/// SEC: 校验整份 custom_engines 数组(patch_prefs 的全量写入路径)。逐项检查 `url`
/// 字段的 scheme,任一不合法即拒绝整次更新。非数组/缺 url 字段时放行(交由上层兜底)。
fn custom_engines_schemes_ok(engines: &Value) -> bool {
    match engines.as_array() {
        Some(arr) => arr
            .iter()
            .all(|e| match e.get("url").and_then(Value::as_str) {
                Some(url) => engine_url_scheme_ok(url),
                None => true,
            }),
        None => true,
    }
}

pub async fn patch_prefs(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<PrefsPatch>,
) -> AppResult<Json<PreferencesView>> {
    // SEC: 全量写入路径同样会落 custom_engines,必须套用与 add_engine 一致的 scheme 校验,
    // 否则可绕过单条新增的校验直接写入 javascript: 引擎。
    if let Some(engines) = body.custom_engines.as_ref() {
        if !custom_engines_schemes_ok(engines) {
            return Err(AppError::BadRequest(
                "engine url scheme must be http or https".into(),
            ));
        }
    }
    // Ensure row exists
    let _ = ensure_prefs(&state, user.id).await?;
    let p: crate::models::UserPreferences = sqlx::query_as(
        "UPDATE user_preferences SET \
           tweaks = COALESCE($1, tweaks), \
           custom_engines = COALESCE($2, custom_engines), \
           pushed_group_wallpapers = COALESCE($3, pushed_group_wallpapers), \
           sidebar_order = COALESCE($4, sidebar_order), \
           updated_at = now() \
         WHERE user_id = $5 RETURNING *",
    )
    .bind(body.tweaks)
    .bind(body.custom_engines)
    .bind(body.pushed_group_wallpapers)
    .bind(body.sidebar_order)
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(p.into()))
}

pub async fn list_engines(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Value>> {
    let p = ensure_prefs(&state, user.id).await?;
    Ok(Json(p.custom_engines))
}

/// SEC: 自定义搜索引擎 URL 仅允许 http/https,或不带 scheme 的纯模板(前端不会
/// 给纯模板补任何 scheme)。若 URL 携带 scheme,则必须是 http/https,否则拒绝 ——
/// 防止 `javascript:`/`data:`/`vbscript:` 等被前端 `window.open` 触发的 self-XSS。
/// 纯函数,可单测。scheme 判定大小写不敏感(`JavaScript:` 同样拦截)。
pub fn engine_url_scheme_ok(url: &str) -> bool {
    let trimmed = url.trim();
    // 取首个 ':' 之前的部分作为可能的 scheme。按 RFC3986,scheme 必须以字母开头,
    // 后接 [A-Za-z0-9+.-]。若冒号前的片段不符合该形态,则不视为 scheme(例如
    // `s?q={q}:x` 里 '?' 出现在 ':' 之前 → 无 scheme,放行)。
    let Some(colon) = trimmed.find(':') else {
        // 完全没有 ':' → 纯模板,放行。
        return true;
    };
    let candidate = &trimmed[..colon];
    let mut chars = candidate.chars();
    let looks_like_scheme = match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {
            chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-')
                && !candidate.is_empty()
        }
        _ => false,
    };
    if !looks_like_scheme {
        // ':' 之前不是合法 scheme(如出现 '/'、'?'、'='、空字符串等)→ 视为无
        // scheme 的相对模板,放行。
        return true;
    }
    let scheme = candidate.to_ascii_lowercase();
    scheme == "http" || scheme == "https"
}

pub async fn add_engine(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<CustomEngineCreate>,
) -> AppResult<Json<Value>> {
    if !body.url.contains("{q}") {
        return Err(AppError::BadRequest(
            "url must contain {q} placeholder".into(),
        ));
    }
    if !engine_url_scheme_ok(&body.url) {
        return Err(AppError::BadRequest(
            "engine url scheme must be http or https".into(),
        ));
    }
    // 确保偏好行存在(custom_engines 默认为空数组)。
    let _ = ensure_prefs(&state, user.id).await?;
    let id = Uuid::new_v4();
    let letter = body
        .label
        .clone()
        .or_else(|| {
            body.name
                .chars()
                .next()
                .map(|c| c.to_uppercase().to_string())
        })
        .unwrap_or_else(|| "?".into());
    let new_engine = json!({
        "id": id,
        "name": body.name,
        "url": body.url,
        "color": body.color.unwrap_or_else(|| "#3b82f6".into()),
        "label": letter,
    });
    // API-4: 原先「读取数组 → 内存追加 → 整体写回」存在并发丢更新竞态(两个并发
    // 添加请求会互相覆盖)。改为单条原子语句:在当前行值上用 jsonb `||` 追加,
    // 数据库内完成读改写,无竞态窗口。
    let v: Value = sqlx::query_scalar(
        "UPDATE user_preferences
            SET custom_engines = COALESCE(custom_engines, '[]'::jsonb) || jsonb_build_array($1::jsonb),
                updated_at = now()
          WHERE user_id = $2
          RETURNING custom_engines",
    )
    .bind(&new_engine)
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(v))
}

pub async fn delete_engine(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    // 确保偏好行存在。
    let _ = ensure_prefs(&state, user.id).await?;
    // API-4: 原先「读取数组 → 内存过滤 → 整体写回」存在并发丢更新竞态。改为单条原子
    // 语句:在数据库内用 jsonb_array_elements 重建剔除目标 id 后的数组,无竞态窗口。
    sqlx::query(
        "UPDATE user_preferences
            SET custom_engines = COALESCE(
                    (SELECT jsonb_agg(e)
                       FROM jsonb_array_elements(custom_engines) e
                      WHERE e->>'id' IS DISTINCT FROM $1),
                    '[]'::jsonb),
                updated_at = now()
          WHERE user_id = $2",
    )
    .bind(id.to_string())
    .bind(user.id)
    .execute(&state.pg)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scheme_less_template_is_ok() {
        // 携带 http/https scheme 的模板放行。
        assert!(engine_url_scheme_ok("https://x.com/s?q={q}"));
        assert!(engine_url_scheme_ok("http://x.com/s?q={q}"));
        // 完全无 scheme 的纯模板放行(前端不会补 scheme)。
        assert!(engine_url_scheme_ok("{q}"));
        assert!(engine_url_scheme_ok("/search?q={q}"));
        // ':' 之前不是合法 scheme 形态(query 里的 ':')→ 视为无 scheme,放行。
        assert!(engine_url_scheme_ok("s?q={q}:foo"));
    }

    #[test]
    fn dangerous_schemes_are_rejected() {
        assert!(!engine_url_scheme_ok("javascript:alert(1);//{q}"));
        assert!(!engine_url_scheme_ok("data:text/html,{q}"));
        assert!(!engine_url_scheme_ok("vbscript:msgbox({q})"));
        // 其它非 http/https scheme 也拒绝。
        assert!(!engine_url_scheme_ok("ftp://x.com/{q}"));
        assert!(!engine_url_scheme_ok("file:///etc/{q}"));
    }

    #[test]
    fn scheme_check_is_case_insensitive() {
        assert!(!engine_url_scheme_ok("JavaScript:alert(1)//{q}"));
        assert!(!engine_url_scheme_ok("JAVASCRIPT:{q}"));
        assert!(!engine_url_scheme_ok("VBScript:{q}"));
        // 大写的合法 scheme 仍放行。
        assert!(engine_url_scheme_ok("HTTPS://x.com/s?q={q}"));
    }

    #[test]
    fn leading_whitespace_does_not_bypass() {
        assert!(!engine_url_scheme_ok("  javascript:alert(1)//{q}"));
        assert!(!engine_url_scheme_ok("\tjavascript:{q}"));
    }

    #[test]
    fn custom_engines_array_validation() {
        let ok = serde_json::json!([
            {"url": "https://a.com/s?q={q}"},
            {"url": "{q}"}
        ]);
        assert!(custom_engines_schemes_ok(&ok));

        let bad = serde_json::json!([
            {"url": "https://a.com/s?q={q}"},
            {"url": "javascript:alert(1)//{q}"}
        ]);
        assert!(!custom_engines_schemes_ok(&bad));

        // 缺 url 字段的项放行;非数组放行。
        assert!(custom_engines_schemes_ok(
            &serde_json::json!([{"name": "x"}])
        ));
        assert!(custom_engines_schemes_ok(&serde_json::json!({})));
    }
}
