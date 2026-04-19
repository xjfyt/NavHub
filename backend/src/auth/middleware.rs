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

/// Injects a `request_id` tracing span for every incoming request,
/// enabling structured log correlation across handlers.
pub async fn inject_request_id(
    req: Request,
    next: Next,
) -> Response {
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
    if data.must_change_password {
        let path = req.uri().path();
        if !path.starts_with("/auth/") && !path.starts_with("/api/auth/") {
            return Err(AppError::Forbidden("must_change_password"));
        }
    }
    let user = SessionUser {
        id: data.user_id,
        role,
        username: data.username.clone(),
        email: data.email.clone(),
    };
    req.extensions_mut().insert(user);

    let state_bg = state.clone();
    let uid = data.user_id;
    tokio::spawn(async move {
        use deadpool_redis::redis::AsyncCommands;
        if let Ok(mut conn) = state_bg.redis.get().await {
            let key = format!("user:seen:{}", uid);
            let locked: bool = conn.set_nx(&key, 1).await.unwrap_or(false);
            if locked {
                let _ = conn.expire::<_, ()>(&key, 60).await;
                let _ = sqlx::query("UPDATE users SET last_seen_at=now() WHERE id=$1")
                    .bind(uid)
                    .execute(&state_bg.pg)
                    .await;
            }
        }
    });

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
                if data.must_change_password {
                    let path = req.uri().path();
                    if !path.starts_with("/auth/") && !path.starts_with("/api/auth/") {
                        return Err(AppError::Forbidden("must_change_password"));
                    }
                }
                let user = SessionUser {
                    id: data.user_id,
                    role: Role::from_str(&data.role).unwrap_or(Role::Guest),
                    username: data.username,
                    email: data.email,
                };
                
                let state_bg = state.clone();
                let uid = user.id;
                tokio::spawn(async move {
                    use deadpool_redis::redis::AsyncCommands;
                    if let Ok(mut conn) = state_bg.redis.get().await {
                        let key = format!("user:seen:{}", uid);
                        let locked: bool = conn.set_nx(&key, 1).await.unwrap_or(false);
                        if locked {
                            let _ = conn.expire::<_, ()>(&key, 60).await;
                            let _ = sqlx::query("UPDATE users SET last_seen_at=now() WHERE id=$1")
                                .bind(uid)
                                .execute(&state_bg.pg)
                                .await;
                        }
                    }
                });
                
                Some(user)
            },
            None => None,
        },
        None => None,
    };
    req.extensions_mut().insert(maybe_user);
    Ok(next.run(req).await)
}
