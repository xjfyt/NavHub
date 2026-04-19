use crate::auth::sso_cache::SsoCache;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub token_type: String,
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub id_token: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UserInfo {
    pub sub: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "preferred_username")]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default, rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
}

pub fn build_authorize_url(sso: &SsoCache, state: &str) -> String {
    let scopes = sso.scopes.join(" ");
    format!(
        "{}/login/oauth/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&state={}",
        sso.issuer.trim_end_matches('/'),
        urlencoding::encode(&sso.client_id),
        urlencoding::encode(&sso.redirect_uri),
        urlencoding::encode(&scopes),
        urlencoding::encode(state),
    )
}

pub async fn exchange_code(client: &reqwest::Client, sso: &SsoCache, code: &str) -> AppResult<TokenResponse> {
    let url = format!(
        "{}/api/login/oauth/access_token",
        sso.issuer.trim_end_matches('/')
    );
    let resp = client
        .post(&url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", &sso.client_id),
            ("client_secret", &sso.client_secret),
            ("redirect_uri", &sso.redirect_uri),
        ])
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(AppError::Internal(format!(
            "casdoor token exchange failed ({}): {}",
            status, text
        )));
    }
    let tok: TokenResponse = serde_json::from_str(&text)
        .map_err(|e| AppError::Internal(format!("parse token: {e} / body: {text}")))?;
    Ok(tok)
}

pub async fn fetch_userinfo(client: &reqwest::Client, sso: &SsoCache, access_token: &str) -> AppResult<UserInfo> {
    let url = format!("{}/api/userinfo", sso.issuer.trim_end_matches('/'));
    let resp = client.get(&url).bearer_auth(access_token).send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(AppError::Internal(format!(
            "casdoor userinfo failed ({}): {}",
            status, text
        )));
    }
    let u: UserInfo = serde_json::from_str(&text)
        .map_err(|e| AppError::Internal(format!("parse userinfo: {e} / body: {text}")))?;
    Ok(u)
}
