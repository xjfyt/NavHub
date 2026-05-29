use crate::{
    error::AppResult,
    models::{SessionUser, User},
    state::AppState,
};
use axum::{extract::State, Extension, Json};
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResp {
    pub id: uuid::Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub has_password: bool,
}

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<MeResp>> {
    let u = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;
    Ok(Json(MeResp {
        id: u.id,
        username: u.username,
        email: u.email,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        role: u.role,
        has_password: u.password_hash.is_some(),
    }))
}

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchMeReq {
    pub display_name: Option<Option<String>>,
    pub avatar_url: Option<Option<String>>,
}

pub async fn patch_me(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(body): Json<PatchMeReq>,
) -> AppResult<Json<MeResp>> {
    let mut u = sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                created_at, updated_at, last_seen_at FROM users WHERE id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.pg)
    .await?;

    if body.display_name.is_some() || body.avatar_url.is_some() {
        let dn = body.display_name.unwrap_or(u.display_name);
        let av = body.avatar_url.unwrap_or(u.avatar_url);

        let u_upd = sqlx::query_as::<_, User>(
            "UPDATE users SET display_name = $1, avatar_url = $2, updated_at = now() WHERE id = $3 \
             RETURNING id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, created_at, updated_at, last_seen_at"
        )
        .bind(&dn)
        .bind(&av)
        .bind(user.id)
        .fetch_one(&state.pg)
        .await?;

        u = u_upd;
    }

    Ok(Json(MeResp {
        id: u.id,
        username: u.username,
        email: u.email,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        role: u.role,
        has_password: u.password_hash.is_some(),
    }))
}
