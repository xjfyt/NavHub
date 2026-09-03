use crate::{
    auth::session,
    error::{AppError, AppResult},
    models::{Role, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Request, State},
    http::{header, HeaderValue},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use uuid::Uuid;

fn append_session_cookie(resp: &mut Response, cookie: &str) {
    if let Ok(v) = HeaderValue::from_str(cookie) {
        resp.headers_mut().append(header::SET_COOKIE, v);
    }
}

/// 处于 must_change_password 状态的会话仍被允许访问的改密端点。
/// 先剥离可选的 `/api` 前缀再比对,兼容 axum nest 是否剥前缀的两种情形。
fn is_must_change_password_allowed(path: &str) -> bool {
    let normalized = path.strip_prefix("/api").unwrap_or(path);
    normalized == "/auth/password/change"
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


fn unauthorized_cleared(state: &Arc<AppState>) -> Response {
    let mut resp = AppError::Unauthorized.into_response();
    append_session_cookie(&mut resp, &session::clear_cookie(session::is_https_public(state)));
    resp
}

async fn db_user_role(
    state: &Arc<AppState>,
    uid: Uuid,
) -> AppResult<Option<(String, bool)>> {
    let row: Option<(String, bool)> = sqlx::query_as(
        "SELECT role, must_change_password FROM users WHERE id = $1",
    )
    .bind(uid)
    .fetch_optional(&state.pg)
    .await?;
    Ok(row)
}

pub async fn require_login(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> AppResult<Response> {
    let sid = session::extract_sid(req.headers()).ok_or(AppError::Unauthorized)?;
    let data = match session::get_session(&state, &sid).await? {
        Some(d) => d,
        None => return Ok(unauthorized_cleared(&state)),
    };
    let db = db_user_role(&state, data.user_id).await?;
    let Some((db_role, db_must_change)) = db else {
        let _ = session::destroy_session(&state, &sid).await;
        return Ok(unauthorized_cleared(&state));
    };
    let role = Role::from_str(&db_role).unwrap_or(Role::Guest);
    let must_change = db_must_change;
    if must_change && !is_must_change_password_allowed(req.uri().path()) {
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
    let refresh_cookie = session::slide_session(&state, &sid, uid).await;

    let mut resp = next.run(req).await;
    if refresh_cookie {
        let cookie = session::build_cookie(
            &sid,
            state.cfg.app.session_ttl_days,
            session::is_https_public(&state),
        );
        append_session_cookie(&mut resp, &cookie);
    }
    Ok(resp)
}

/// 将 `Option<SessionUser>` 作为扩展注入;未登录时为 None,用于游客可见路由。
pub async fn optional_login(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> AppResult<Response> {
    let sid_opt = session::extract_sid(req.headers());
    let mut stale_cookie = false;
    let maybe_user: Option<SessionUser> = match sid_opt.as_deref() {
        Some(sid) => match session::get_session(&state, sid).await? {
            Some(data) => {
                match db_user_role(&state, data.user_id).await? {
                    None => {
                        let _ = session::destroy_session(&state, sid).await;
                        stale_cookie = true;
                        None
                    }
                    Some((db_role, db_must_change)) => {
                        if db_must_change && !is_must_change_password_allowed(req.uri().path()) {
                            return Err(AppError::Forbidden("must_change_password"));
                        }
                        let user = SessionUser {
                            id: data.user_id,
                            role: Role::from_str(&db_role).unwrap_or(Role::Guest),
                            username: data.username,
                            email: data.email,
                        };
                        bump_last_seen(state.clone(), user.id);
                        Some(user)
                    }
                }
            }
            None => {
                stale_cookie = true;
                None
            }
        },
        None => None,
    };
    let refresh_cookie = match (sid_opt.as_deref(), maybe_user.as_ref()) {
        (Some(sid), Some(u)) => session::slide_session(&state, sid, u.id).await,
        _ => false,
    };
    req.extensions_mut().insert(maybe_user);
    let mut resp = next.run(req).await;
    if stale_cookie {
        append_session_cookie(
            &mut resp,
            &session::clear_cookie(session::is_https_public(&state)),
        );
    } else if refresh_cookie {
        if let Some(sid) = sid_opt {
            let cookie = session::build_cookie(
                &sid,
                state.cfg.app.session_ttl_days,
                session::is_https_public(&state),
            );
            append_session_cookie(&mut resp, &cookie);
        }
    }
    Ok(resp)
}
