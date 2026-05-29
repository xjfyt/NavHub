use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    handlers::util,
    models::{Role, SessionUser, User},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub has_password: bool,
    pub casdoor_bound: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_seen_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<User> for UserRow {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            role: u.role,
            has_password: u.password_hash.is_some(),
            casdoor_bound: u.casdoor_id.is_some(),
            created_at: u.created_at,
            last_seen_at: u.last_seen_at,
        }
    }
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
) -> AppResult<Json<Vec<UserRow>>> {
    require_at_least_admin(user.role)?;
    let users: Vec<User> = sqlx::query_as(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
         created_at, updated_at, last_seen_at FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.pg)
    .await?;
    Ok(Json(users.into_iter().map(UserRow::from).collect()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUser {
    pub role: Option<String>,
    pub display_name: Option<String>,
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUser>,
) -> AppResult<Json<UserRow>> {
    require_at_least_admin(user.role)?;
    if let Some(ref r) = body.role {
        let role = Role::from_str(r).ok_or_else(|| AppError::BadRequest("invalid role".into()))?;
        // Only superadmin can grant superadmin or demote superadmin
        if matches!(role, Role::Superadmin) && !matches!(user.role, Role::Superadmin) {
            return Err(AppError::Forbidden("only_superadmin_can_grant"));
        }
        let existing: User = sqlx::query_as(
            "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
             created_at, updated_at, last_seen_at FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;
        if matches!(existing.role_enum(), Role::Superadmin)
            && !matches!(user.role, Role::Superadmin)
        {
            return Err(AppError::Forbidden("cannot_modify_superadmin"));
        }
    }
    let updated: User = sqlx::query_as(
        "UPDATE users SET role = COALESCE($1, role), \
           display_name = COALESCE($2, display_name), \
           updated_at = now() \
         WHERE id = $3 \
         RETURNING id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
                   created_at, updated_at, last_seen_at",
    )
    .bind(body.role.as_deref())
    .bind(body.display_name.as_deref())
    .bind(id)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    util::audit(
        &state,
        Some(&user),
        "admin_update_user",
        Some(updated.username.clone()),
        "user",
        Some(serde_json::json!({ "role": updated.role })),
    )
    .await;
    Ok(Json(updated.into()))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    if id == user.id {
        return Err(AppError::BadRequest("cannot delete self".into()));
    }
    let victim: User = sqlx::query_as(
        "SELECT id, username, email, display_name, avatar_url, role, password_hash, casdoor_id, \
         created_at, updated_at, last_seen_at FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    if matches!(victim.role_enum(), Role::Superadmin) {
        return Err(AppError::Forbidden("cannot_delete_superadmin"));
    }

    // DATA-3: 隐私/合规 —— 删除用户前先收集其 S3 对象(头像 + 该用户上传的图标 blob),
    // 删行后再清理对象,否则它们会永远滞留在桶里。仅删可识别为我们 /uploads/ 命名空间
    // 的对象;外链头像(如 OIDC 提供的 gravatar)key_from_stored_value 返回 None 自动跳过。
    // 先采集 key,因为 DELETE users 会 CASCADE 掉相关行(library_icons.uploader_id 为
    // ON DELETE SET NULL,所以这里在删行前查;查不到/失败都不应阻塞用户删除)。
    let mut s3_keys: Vec<String> = Vec::new();
    if let Some(av) = victim.avatar_url.as_deref() {
        if let Some(k) = crate::storage::key_from_stored_value(av) {
            s3_keys.push(k);
        }
    }
    let owned_urls: Vec<(String,)> =
        sqlx::query_as("SELECT url FROM library_icons WHERE uploader_id = $1")
            .bind(id)
            .fetch_all(&state.pg)
            .await
            .unwrap_or_default();
    for (url,) in owned_urls {
        if let Some(k) = crate::storage::key_from_stored_value(&url) {
            s3_keys.push(k);
        }
    }

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.pg)
        .await?;

    // S3 清理是尽力而为:对象删失败不回滚用户删除(用户已删是更重要的合规结果),
    // 残留对象由 DATA-4 的孤儿 GC 兜底。去重避免重复 key。
    if !s3_keys.is_empty() {
        s3_keys.sort();
        s3_keys.dedup();
        if let Err(e) = state.storage.delete_objects(&s3_keys).await {
            tracing::warn!("failed to delete S3 objects for user {id}: {e}");
        }
    }

    let _ = crate::auth::session::clear_all_user_sessions(&state, id).await;
    util::audit(
        &state,
        Some(&user),
        "admin_delete_user",
        Some(victim.username),
        "user",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}
