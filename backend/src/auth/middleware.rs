use crate::{
    auth::session,
    error::{AppError, AppResult},
    models::{Role, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;
use tracing::Instrument;
use uuid::Uuid;

/// 处于 must_change_password 状态的会话仍被允许访问的改密端点。
/// 先剥离可选的 `/api` 前缀再比对,兼容 axum nest 是否剥前缀的两种情形。
fn is_must_change_password_allowed(path: &str) -> bool {
    let normalized = path.strip_prefix("/api").unwrap_or(path);
    normalized == "/auth/password/change"
}

/// Injects a `request_id` tracing span for every incoming request,
/// enabling structured log correlation across handlers.
pub async fn inject_request_id(req: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4();
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let span = tracing::info_span!(
        "http",
        %request_id,
        %method,
        %path,
    );
    async move { next.run(req).await }.instrument(span).await
}

/// Bump `last_seen_at` at most once per minute per user, using a single
/// `SET … NX EX` so the key + TTL land atomically (the prior code did `SETNX`
/// then `EXPIRE` — if the second command failed, the key would never expire).
fn bump_last_seen(state: Arc<AppState>, uid: Uuid) {
    tokio::spawn(async move {
        let Ok(mut conn) = state.redis.get().await else {
            return;
        };
        let key = format!("user:seen:{uid}");
        let res: redis::RedisResult<Option<String>> = redis::cmd("SET")
            .arg(&key)
            .arg(1)
            .arg("NX")
            .arg("EX")
            .arg(60)
            .query_async(&mut *conn)
            .await;
        // SET NX returns Some("OK") when the key was set, None when it already existed.
        if !matches!(res, Ok(Some(_))) {
            return;
        }
        let _ = sqlx::query("UPDATE users SET last_seen_at=now() WHERE id=$1")
            .bind(uid)
            .execute(&state.pg)
            .await;
    });
}

pub async fn require_login(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> AppResult<Response> {
    let sid = session::extract_sid(req.headers()).ok_or(AppError::Unauthorized)?;
    let data = session::get_session(&state, &sid)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let role = Role::from_str(&data.role).unwrap_or(Role::Guest);
    if data.must_change_password && !is_must_change_password_allowed(req.uri().path()) {
        return Err(AppError::Forbidden("must_change_password"));
    }
    let user = SessionUser {
        id: data.user_id,
        role,
        username: data.username.clone(),
        email: data.email.clone(),
    };
    let uid = user.id;
    req.extensions_mut().insert(user);

    bump_last_seen(state.clone(), uid);

    Ok(next.run(req).await)
}

/// 将 `Option<SessionUser>` 作为扩展注入;未登录时为 None,用于游客可见路由。
pub async fn optional_login(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> AppResult<Response> {
    let maybe_user: Option<SessionUser> = match session::extract_sid(req.headers()) {
        Some(sid) => match session::get_session(&state, &sid).await? {
            Some(data) => {
                if data.must_change_password
                    && !is_must_change_password_allowed(req.uri().path())
                {
                    return Err(AppError::Forbidden("must_change_password"));
                }
                let user = SessionUser {
                    id: data.user_id,
                    role: Role::from_str(&data.role).unwrap_or(Role::Guest),
                    username: data.username,
                    email: data.email,
                };
                bump_last_seen(state.clone(), user.id);
                Some(user)
            }
            None => None,
        },
        None => None,
    };
    req.extensions_mut().insert(maybe_user);
    Ok(next.run(req).await)
}
