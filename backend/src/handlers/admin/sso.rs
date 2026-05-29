use crate::{
    auth::{require_superadmin, sso_cache::SsoCache},
    error::AppResult,
    handlers::util,
    models::SessionUser,
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoView {
    pub enabled: bool,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    /// AUTH-1: explicit JWKS endpoint; empty means "derive from issuer".
    pub jwks_uri: String,
}

pub async fn get(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<SsoView>> {
    require_superadmin(user.role)?;
    // OPS-11: 经 TTL 缓存读取(陈旧时自动重载),让超管页看到的也是较新的配置。
    let sso = state.current_sso().await;
    Ok(Json(SsoView {
        enabled: sso.enabled,
        issuer: sso.issuer,
        client_id: sso.client_id,
        client_secret: sso.client_secret,
        redirect_uri: sso.redirect_uri,
        scopes: sso.scopes,
        jwks_uri: sso.jwks_uri,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoPatch {
    pub enabled: Option<bool>,
    pub issuer: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub redirect_uri: Option<String>,
    pub scopes: Option<Vec<String>>,
    pub jwks_uri: Option<String>,
}

pub async fn patch(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<SsoPatch>,
) -> AppResult<Json<SsoView>> {
    require_superadmin(user.role)?;
    let mut new_cache: SsoCache = state.current_sso().await;
    if let Some(v) = body.enabled {
        new_cache.enabled = v;
    }
    if let Some(v) = body.issuer {
        new_cache.issuer = v;
    }
    if let Some(v) = body.client_id {
        new_cache.client_id = v;
    }
    if let Some(v) = body.client_secret {
        if !v.is_empty() {
            new_cache.client_secret = v;
        }
    }
    if let Some(v) = body.redirect_uri {
        new_cache.redirect_uri = v;
    }
    if let Some(v) = body.scopes {
        new_cache.scopes = v;
    }
    if let Some(v) = body.jwks_uri {
        new_cache.jwks_uri = v;
    }
    new_cache.save(&state.pg).await?;
    // OPS-11: 持久化后立即刷新本副本缓存并重置 TTL;其它副本靠 TTL 重载感知。
    state.set_sso(new_cache.clone()).await;
    util::audit(
        &state,
        Some(&user),
        "update_sso",
        Some(new_cache.issuer.clone()),
        "sso",
        None,
    )
    .await;
    Ok(Json(SsoView {
        enabled: new_cache.enabled,
        issuer: new_cache.issuer,
        client_id: new_cache.client_id,
        client_secret: new_cache.client_secret,
        redirect_uri: new_cache.redirect_uri,
        scopes: new_cache.scopes,
        jwks_uri: new_cache.jwks_uri,
    }))
}
