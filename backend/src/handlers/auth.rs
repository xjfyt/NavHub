use crate::{
    auth::{
        casdoor, oidc, password,
        session::{self, SessionData},
    },
    error::{AppError, AppResult},
    handlers::util,
    models::{SessionUser, User},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn login(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    // OPS-11: 经 TTL 缓存读取 SSO 配置;陈旧时自动从 app_settings 重载。
    let sso = state.current_sso().await;
    if !sso.enabled {
        return Err(AppError::Forbidden("sso_disabled"));
    }
    // AUTH-7 + AUTH-1: mint a per-login secret (state + nonce + PKCE verifier)
    // and bind it to THIS browser via an HttpOnly, SameSite=Lax cookie instead
    // of an unbound server-side `oauth_state:*` key. The callback only accepts a
    // `state` that matches the value carried back in this cookie, defeating
    // login-CSRF / fixation; `nonce` defeats ID-token replay; the PKCE challenge
    // binds the auth code to the verifier this browser holds.
    let flow = oidc::OauthFlow::generate();
    let url = casdoor::build_authorize_url(&sso, &flow.state, &flow.nonce, &flow.code_challenge());
    let cookie = oidc::build_flow_cookie(
        &flow.encode_cookie_value(),
        session::is_https_public(&state),
    );
    let mut resp = Redirect::temporary(&url).into_response();
    resp.headers_mut()
        .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
    Ok(resp)
}

pub async fn callback(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<CallbackQuery>,
) -> AppResult<Response> {
    // Run the verified flow; on ANY outcome clear the single-use flow cookie so
    // a bound secret can never be replayed (success consumes it; failure burns it).
    let secure = session::is_https_public(&state);
    let result = callback_inner(&state, &headers, q).await;
    match result {
        Ok(mut resp) => {
            append_set_cookie(&mut resp, &oidc::clear_flow_cookie(secure));
            Ok(resp)
        }
        Err(e) => Err(e),
    }
}

/// Append an extra `Set-Cookie` header (does not clobber an existing one such as
/// the session cookie).
fn append_set_cookie(resp: &mut Response, cookie: &str) {
    if let Ok(v) = HeaderValue::from_str(cookie) {
        resp.headers_mut().append(header::SET_COOKIE, v);
    }
}

async fn callback_inner(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    q: CallbackQuery,
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

    // AUTH-7: recover the browser-bound flow secret from the HttpOnly cookie and
    // require the query `state` to equal the bound value. Missing cookie /
    // malformed cookie / mismatch all reject (login-CSRF / fixation defense).
    let flow = oidc::extract_flow_cookie(headers)
        .and_then(|raw| oidc::OauthFlow::decode_cookie_value(&raw))
        .ok_or(AppError::Forbidden("oauth_state_missing"))?;
    if st != flow.state {
        return Err(AppError::Forbidden("oauth_state_mismatch"));
    }

    // OPS-11: 经 TTL 缓存读取 SSO 配置;陈旧时自动从 app_settings 重载。
    let sso = state.current_sso().await;
    // AUTH-1: the OIDC security path uses a TLS-VALIDATING client (never the
    // lenient one) for token exchange, JWKS fetch and userinfo. Accepting an
    // invalid cert here would let a MITM forge tokens/keys and defeat the whole
    // verification.
    let token =
        casdoor::exchange_code(&state.oidc_client, &sso, &code, &flow.code_verifier).await?;

    // AUTH-1: verify the ID token (RS256 against provider JWKS; iss/aud/exp +
    // nonce-bound) and use its claims as the trusted identity. Casdoor returns a
    // standard OIDC `id_token`; absence means we cannot establish a verified
    // identity, so reject rather than fall back to unverified userinfo.
    let id_token = token
        .id_token
        .as_deref()
        .ok_or(AppError::Forbidden("sso_missing_id_token"))?;
    let jwks_uri = sso.jwks_uri();
    let claims = oidc::verify_id_token_with_cache(
        &state.jwks_cache,
        &state.oidc_client,
        &jwks_uri,
        id_token,
        &sso.issuer,
        &sso.client_id,
        &flow.nonce,
    )
    .await
    .map_err(|e| {
        tracing::warn!(error = ?e, "AUTH-1: ID token verification failed");
        AppError::Forbidden("sso_id_token_invalid")
    })?;

    // Enrich display/avatar from userinfo (non-authoritative; identity comes from
    // the verified ID token). Best-effort — a userinfo failure must not block a
    // login whose identity is already cryptographically verified.
    let info = casdoor::fetch_userinfo(&state.oidc_client, &sso, &token.access_token)
        .await
        .ok();

    let email = claims
        .email
        .clone()
        .or_else(|| info.as_ref().and_then(|i| i.email.clone()))
        .ok_or_else(|| AppError::BadRequest("id token missing email".into()))?;
    let username = claims
        .preferred_username
        .clone()
        .or_else(|| info.as_ref().and_then(|i| i.preferred_username.clone()))
        .or_else(|| claims.name.clone())
        .or_else(|| info.as_ref().and_then(|i| i.name.clone()))
        .unwrap_or_else(|| email.split('@').next().unwrap_or("user").to_string());
    let display = info
        .as_ref()
        .and_then(|i| i.display_name.clone().or_else(|| i.name.clone()))
        .or_else(|| claims.name.clone());
    let avatar = info
        .as_ref()
        .and_then(|i| i.avatar.clone().or_else(|| i.picture.clone()));

    // Trusted identity is the verified ID-token `sub` + `email` + `email_verified`.
    // If a superadmin exists with this email but no casdoor_id, bind it
    // (only when the IdP asserts the email is verified — see AUTH-2).
    let user = upsert_sso_user(
        state,
        &claims.sub,
        &email,
        claims.email_verified,
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
    let sid = session::create_session(state, &sd).await?;
    util::audit(
        state,
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
        session::is_https_public(state),
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
    // AUTH-4: per-account cap so an attacker rotating source IPs (or coming via a
    // trusted proxy that collapses many clients onto one XFF) still can't brute
    // a single account. Keyed by the submitted identity, independent of the
    // per-IP middleware limit.
    crate::auth::rate_limit::check_account_limit(&state, &body.username).await?;
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
    let sso = state.current_sso().await;
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
    let sso = state.current_sso().await;
    Json(PublicConfig {
        sso_enabled: sso.enabled,
        app_name: state.cfg.app.site_name.clone(),
    })
}

/// AUTH-2: decide whether an SSO identity may auto-bind to an EXISTING local
/// account matched by email. Binding silently grants the SSO user the existing
/// (possibly privileged) account, so we require the IdP to assert the email is
/// verified. A missing claim (`None`) or `Some(false)` refuses the bind — an
/// attacker who can register an unverified address at the IdP that collides
/// with an admin's email must not be able to take it over.
fn sso_email_bind_allowed(email_verified: Option<bool>) -> bool {
    matches!(email_verified, Some(true))
}

/// AUTH-3: decide whether a freshly-created SSO user may be auto-promoted to
/// superadmin via the "first SSO login binds the privileged account" convenience.
///
/// SECURITY: this convenience is dangerous — without gating, the very first
/// person to complete SSO (potentially an attacker who races to log in before
/// the legitimate operator) seizes superadmin. We therefore gate it behind:
///   1. `enabled` (config `superadmin.first_sso_bind`, defaults OFF), AND
///   2. `no_superadmin_yet` (only ever fires while the install has no superadmin), AND
///   3. an optional allowlist: when non-empty, the new user's email OR subject
///      MUST appear in it (case-insensitive on email). An empty allowlist keeps
///      the legacy "first one wins" behavior but only when the operator has
///      explicitly flipped `first_sso_bind` on.
fn first_sso_bind_allowed(
    enabled: bool,
    no_superadmin_yet: bool,
    allowlist: &[String],
    email: &str,
    sub: &str,
) -> bool {
    if !enabled || !no_superadmin_yet {
        return false;
    }
    if allowlist.is_empty() {
        return true;
    }
    allowlist.iter().any(|entry| {
        let e = entry.trim();
        e.eq_ignore_ascii_case(email) || e == sub
    })
}

async fn upsert_sso_user(
    state: &Arc<AppState>,
    sub: &str,
    email: &str,
    email_verified: Option<bool>,
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
        // AUTH-2: only auto-bind to a pre-existing (possibly privileged) account
        // when the IdP asserts the email is verified. Otherwise refuse: an
        // attacker registering an unverified address that collides with an
        // admin's email must not silently inherit that account. We reject rather
        // than fall through to a fresh insert because `email` is UNIQUE — a
        // fall-through would only produce an opaque 500.
        if !sso_email_bind_allowed(email_verified) {
            tracing::warn!(
                email = %email,
                sub = %sub,
                "refusing SSO bind to existing account: email not verified by IdP (AUTH-2)"
            );
            return Err(AppError::Forbidden("sso_email_unverified"));
        }
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
    // 3. create new user as 'user' (or superadmin if the gated first-SSO-bind
    // convenience applies — see `first_sso_bind_allowed` for the risk gating).
    let initial_role: &str = if first_sso_bind_allowed(
        state.cfg.superadmin.first_sso_bind,
        !any_superadmin(&state.pg).await?,
        &state.cfg.superadmin.first_sso_bind_allowlist,
        email,
        sub,
    ) {
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
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    headers: HeaderMap,
    Json(body): Json<UpdatePasswordReq>,
) -> AppResult<Response> {
    if body.new_password.len() < 8 {
        return Err(AppError::BadRequest("Password too short (min 8)".into()));
    }
    // AUTH-5: 必须校验当前密码,防止会话被劫持后无需旧密码即可改密、把合法用户锁死。
    let stored: Option<Option<String>> =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
            .bind(user.id)
            .fetch_optional(&state.pg)
            .await?;
    let current_hash = stored
        .flatten()
        .ok_or_else(|| AppError::BadRequest("no password set for this account".into()))?;
    if !password::verify_password(&body.current_password, &current_hash) {
        return Err(AppError::BadRequest("current password incorrect".into()));
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

#[cfg(test)]
mod tests {
    use super::*;

    // AUTH-2: email-bind decision.
    #[test]
    fn bind_allowed_only_when_email_verified() {
        assert!(sso_email_bind_allowed(Some(true)));
    }

    #[test]
    fn bind_refused_when_email_unverified_or_missing() {
        assert!(!sso_email_bind_allowed(Some(false)));
        assert!(!sso_email_bind_allowed(None));
    }

    // AUTH-3: first-SSO-bind promotion gating.
    #[test]
    fn first_bind_off_by_default_never_promotes() {
        // disabled => never, even with no superadmin and matching allowlist.
        assert!(!first_sso_bind_allowed(false, true, &[], "a@x.com", "sub1"));
        assert!(!first_sso_bind_allowed(
            false,
            true,
            &["a@x.com".into()],
            "a@x.com",
            "sub1"
        ));
    }

    #[test]
    fn first_bind_blocked_when_superadmin_exists() {
        assert!(!first_sso_bind_allowed(true, false, &[], "a@x.com", "sub1"));
    }

    #[test]
    fn first_bind_enabled_empty_allowlist_allows_first() {
        assert!(first_sso_bind_allowed(true, true, &[], "a@x.com", "sub1"));
    }

    #[test]
    fn first_bind_allowlist_gates_identity() {
        let allow = vec!["admin@example.com".to_string(), "sub-trusted".to_string()];
        // email match (case-insensitive)
        assert!(first_sso_bind_allowed(
            true,
            true,
            &allow,
            "Admin@Example.com",
            "sub-x"
        ));
        // subject match
        assert!(first_sso_bind_allowed(
            true,
            true,
            &allow,
            "other@x.com",
            "sub-trusted"
        ));
        // neither matches => refused even though enabled and no superadmin
        assert!(!first_sso_bind_allowed(
            true,
            true,
            &allow,
            "evil@x.com",
            "sub-evil"
        ));
    }
}
