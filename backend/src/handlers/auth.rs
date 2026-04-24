use crate::{
    auth::{
        casdoor, password,
        session::{self, SessionData},
    },
    error::{AppError, AppResult},
    handlers::util,
    models::{User, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    Json, Extension,
};
use deadpool_redis::redis::AsyncCommands;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn login(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    let sso = state.sso.read().await.clone();
    if !sso.enabled {
        return Err(AppError::Forbidden("sso_disabled"));
    }
    let rand_state: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let mut conn = state.redis.get().await?;
    let _: () = conn
        .set_ex(format!("oauth_state:{rand_state}"), "1", 300)
        .await?;
    let url = casdoor::build_authorize_url(&sso, &rand_state);
    Ok(Redirect::temporary(&url).into_response())
}

pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CallbackQuery>,
) -> AppResult<Response> {
    if let Some(err) = q.error {
        return Err(AppError::BadRequest(format!("sso error: {}", err)));
    }
    let code = q
        .code
        .ok_or_else(|| AppError::BadRequest("missing code".into()))?;
    let st = q
        .state
        .ok_or_else(|| AppError::BadRequest("missing state".into()))?;

    // Validate state
    {
        let mut conn = state.redis.get().await?;
        let key = format!("oauth_state:{st}");
        let found: Option<String> = conn.get(&key).await?;
        if found.is_none() {
            return Err(AppError::BadRequest("invalid state".into()));
        }
        let _: () = conn.del(&key).await?;
    }

    let sso = state.sso.read().await.clone();
    let token = casdoor::exchange_code(&state.reqwest_client, &sso, &code).await?;
    let info = casdoor::fetch_userinfo(&state.reqwest_client, &sso, &token.access_token).await?;

    let email = info
        .email
        .clone()
        .ok_or_else(|| AppError::BadRequest("casdoor userinfo missing email".into()))?;
    let username = info
        .preferred_username
        .clone()
        .or_else(|| info.name.clone())
        .unwrap_or_else(|| email.split('@').next().unwrap_or("user").to_string());
    let display = info.display_name.clone().or(info.name.clone());
    let avatar = info.avatar.clone().or(info.picture.clone());

    // If a superadmin exists with this email but no casdoor_id, bind it.
    let user = upsert_sso_user(
        &state,
        &info.sub,
        &email,
        &username,
        display.as_deref(),
        avatar.as_deref(),
    )
    .await?;

    let sd = SessionData {
        user_id: user.id,
        role: user.role.clone(),
        username: user.username.clone(),
        email: user.email.clone(),
        must_change_password: user.must_change_password,
    };
    let sid = session::create_session(&state, &sd).await?;
    util::audit(
        &state,
        None,
        "sso_login",
        Some(user.username.clone()),
        "auth",
        None,
    )
    .await;

    let cookie = session::build_cookie(
        &sid,
        state.cfg.app.session_ttl_days,
        session::is_https_public(&state),
    );
    let mut resp = Redirect::temporary("/").into_response();
    resp.headers_mut()
        .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
    Ok(resp)
}

#[derive(Debug, Deserialize)]
pub struct PasswordReq {
    pub username: String,
    pub password: String,
}

pub async fn password(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PasswordReq>,
) -> AppResult<Response> {
    if !state.cfg.superadmin.password_login_enabled {
        return Err(AppError::Forbidden("password_login_disabled"));
    }
    let row: Option<User> = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at, must_change_password FROM users WHERE username = $1 OR email = $1",
    )
    .bind(&body.username)
    .fetch_optional(&state.pg)
    .await?;
    let user = row.ok_or_else(|| AppError::BadRequest("invalid credentials".into()))?;
    if user.role != "superadmin" {
        return Err(AppError::Forbidden("sso_required"));
    }
    let hash = user.password_hash.as_ref().ok_or(AppError::Unauthorized)?;
    if !password::verify_password(&body.password, hash) {
        return Err(AppError::BadRequest("invalid credentials".into()));
    }
    sqlx::query("UPDATE users SET last_seen_at = now() WHERE id = $1")
        .bind(user.id)
        .execute(&state.pg)
        .await?;

    let sd = SessionData {
        user_id: user.id,
        role: user.role.clone(),
        username: user.username.clone(),
        email: user.email.clone(),
        must_change_password: user.must_change_password,
    };
    let sid = session::create_session(&state, &sd).await?;
    util::audit(
        &state,
        None,
        "password_login",
        Some(user.username.clone()),
        "auth",
        None,
    )
    .await;

    let cookie = session::build_cookie(
        &sid,
        state.cfg.app.session_ttl_days,
        session::is_https_public(&state),
    );
    let mut resp = (StatusCode::NO_CONTENT, "").into_response();
    resp.headers_mut()
        .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
    Ok(resp)
}

pub async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(sid) = session::extract_sid(&headers) {
        let _ = session::destroy_session(&state, &sid).await;
    }
    let cookie = session::clear_cookie(session::is_https_public(&state));
    let mut resp = (StatusCode::NO_CONTENT, "").into_response();
    resp.headers_mut()
        .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
    Ok(resp)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResp {
    pub authenticated: bool,
    pub sso_enabled: bool,
    pub password_enabled: bool,
    pub app_name: String,
    pub must_change_password: bool,
}

pub async fn status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> AppResult<Json<StatusResp>> {
    let sso = state.sso.read().await;
    let (authed, must_change) = match session::extract_sid(&headers) {
        Some(sid) => match session::get_session(&state, &sid).await? {
            Some(data) => (true, data.must_change_password),
            None => (false, false),
        },
        None => (false, false),
    };
    Ok(Json(StatusResp {
        authenticated: authed,
        sso_enabled: sso.enabled,
        password_enabled: state.cfg.superadmin.password_login_enabled,
        app_name: state.cfg.app.site_name.clone(),
        must_change_password: must_change,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub sso_enabled: bool,
    pub app_name: String,
}

pub async fn public_config(State(state): State<Arc<AppState>>) -> Json<PublicConfig> {
    let sso = state.sso.read().await;
    Json(PublicConfig {
        sso_enabled: sso.enabled,
        app_name: state.cfg.app.site_name.clone(),
    })
}

async fn upsert_sso_user(
    state: &Arc<AppState>,
    sub: &str,
    email: &str,
    username: &str,
    display_name: Option<&str>,
    avatar: Option<&str>,
) -> AppResult<User> {
    // 1. match by casdoor_id
    if let Some(u) = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE casdoor_id = $1",
    )
    .bind(sub)
    .fetch_optional(&state.pg)
    .await?
    {
        sqlx::query(
            "UPDATE users SET email=$1, display_name=COALESCE($2, display_name), \
             avatar_url=COALESCE($3, avatar_url), last_seen_at=now(), updated_at=now() WHERE id=$4",
        )
        .bind(email)
        .bind(display_name)
        .bind(avatar)
        .bind(u.id)
        .execute(&state.pg)
        .await?;
        return fetch_user(state, u.id).await;
    }
    // 2. bind to existing user by email (important for superadmin first SSO login)
    if let Some(u) = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE email = $1",
    )
    .bind(email)
    .fetch_optional(&state.pg)
    .await?
    {
        sqlx::query(
            "UPDATE users SET casdoor_id=$1, display_name=COALESCE($2, display_name), \
             avatar_url=COALESCE($3, avatar_url), last_seen_at=now(), updated_at=now() WHERE id=$4",
        )
        .bind(sub)
        .bind(display_name)
        .bind(avatar)
        .bind(u.id)
        .execute(&state.pg)
        .await?;
        return fetch_user(state, u.id).await;
    }
    // 3. create new user as 'user'
    let initial_role: &str =
        if state.cfg.superadmin.first_sso_bind && !any_superadmin(&state.pg).await? {
            "superadmin"
        } else {
            "user"
        };
    let id: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO users (id, username, email, display_name, avatar_url, role, casdoor_id, last_seen_at) \
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now()) \
         ON CONFLICT (username) DO UPDATE SET email=EXCLUDED.email, casdoor_id=EXCLUDED.casdoor_id RETURNING id",
    )
    .bind(username)
    .bind(email)
    .bind(display_name)
    .bind(avatar)
    .bind(initial_role)
    .bind(sub)
    .fetch_one(&state.pg)
    .await?;
    if initial_role == "superadmin" {
        tracing::info!(
            "first_sso_bind: promoted new SSO user {} ({}) to superadmin",
            username,
            email
        );
        util::audit(
            state,
            None,
            "first_sso_bind",
            Some(username.to_string()),
            "auth",
            None,
        )
        .await;
    }
    fetch_user(state, id.0).await
}

async fn any_superadmin(pg: &sqlx::PgPool) -> AppResult<bool> {
    let row: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1")
            .fetch_optional(pg)
            .await?;
    Ok(row.is_some())
}

async fn fetch_user(state: &Arc<AppState>, id: uuid::Uuid) -> AppResult<User> {
    let u = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.pg)
    .await?;
    Ok(u)
}

#[derive(Debug, Deserialize)]
pub struct UpdatePasswordReq {
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    headers: HeaderMap,
    Json(body): Json<UpdatePasswordReq>,
) -> AppResult<Response> {
    if body.new_password.len() < 6 {
        return Err(AppError::BadRequest("Password too short".into()));
    }
    let hash = password::hash_password(&body.new_password)?;
    sqlx::query("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2")
        .bind(hash)
        .bind(user.id)
        .execute(&state.pg)
        .await?;

    // 销毁当前会话并清理 cookie,强制用户用新密码重新登录。
    // 比原地改写 session 状态更稳妥:避免中间件/前端对陈旧 session 的缓存假设。
    if let Some(sid) = session::extract_sid(&headers) {
        let _ = session::destroy_session(&state, &sid).await;
    }
    let cookie = session::clear_cookie(session::is_https_public(&state));
    let mut resp = (StatusCode::NO_CONTENT, "").into_response();
    resp.headers_mut()
        .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
    Ok(resp)
}
