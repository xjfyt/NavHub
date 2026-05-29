use crate::{
    error::{AppError, AppResult},
    models::{Group, Role, SessionUser},
    state::AppState,
};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

/// API-1: 校验推送/系统消息的目标 (target_type, role, user) 三元组的一致性。
/// 这是一个纯函数,便于单元测试,被 push 与系统消息两处复用。
///
/// 规则:
///   - target_type=all  → 不允许携带 role 或 user_id
///   - target_type=role → 必须给出合法 role,且不允许携带 user_id
///   - target_type=user → 必须给出 user_id,且不允许携带 role
///   - 其他 target_type  → 非法
///
/// 返回归一化后的 (target_type, role, user_id);user_id 是否真实存在由调用方
/// 在数据库层另行校验(本函数不触库)。
pub fn validate_push_target(
    target_type: &str,
    target_role: Option<&str>,
    target_user_id: Option<Uuid>,
) -> AppResult<(String, Option<String>, Option<Uuid>)> {
    match target_type.trim() {
        "all" => {
            if target_role.map(str::trim).filter(|v| !v.is_empty()).is_some() {
                return Err(AppError::BadRequest(
                    "target_type=all must not include a role".into(),
                ));
            }
            if target_user_id.is_some() {
                return Err(AppError::BadRequest(
                    "target_type=all must not include a user".into(),
                ));
            }
            Ok(("all".into(), None, None))
        }
        "role" => {
            if target_user_id.is_some() {
                return Err(AppError::BadRequest(
                    "target_type=role must not include a user".into(),
                ));
            }
            let role = target_role
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .and_then(Role::from_str)
                .ok_or_else(|| AppError::BadRequest("invalid target role".into()))?;
            Ok(("role".into(), Some(role.as_str().to_string()), None))
        }
        "user" => {
            if target_role.map(str::trim).filter(|v| !v.is_empty()).is_some() {
                return Err(AppError::BadRequest(
                    "target_type=user must not include a role".into(),
                ));
            }
            let uid = target_user_id
                .ok_or_else(|| AppError::BadRequest("target user is required".into()))?;
            Ok(("user".into(), None, Some(uid)))
        }
        _ => Err(AppError::BadRequest("invalid target type".into())),
    }
}

pub async fn audit(
    state: &Arc<AppState>,
    actor: Option<&SessionUser>,
    action: &str,
    target: Option<String>,
    kind: &str,
    detail: Option<Value>,
) {
    let (id, name): (Option<Uuid>, Option<String>) = match actor {
        Some(u) => (Some(u.id), Some(u.username.clone())),
        None => (None, None),
    };
    let res = sqlx::query(
        "INSERT INTO audit_log (actor_id, actor_name, action, target, kind, detail) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(name)
    .bind(action)
    .bind(target)
    .bind(kind)
    .bind(detail)
    .execute(&state.pg)
    .await;
    if let Err(e) = res {
        tracing::warn!("audit insert failed: {e}");
    }
}

/// 当前用户是否属于该推送分组的目标受众。
/// 推送目标可为全部用户(all)、某角色(role)或指定用户(user)。
pub fn user_is_push_target(group: &Group, user: &SessionUser) -> bool {
    match group.push_target_type.as_str() {
        "all" => true,
        "role" => group.push_target_role.as_deref() == Some(user.role.as_str()),
        "user" => group.push_target_user_id == Some(user.id),
        _ => false,
    }
}

/// 判断 `user` 是否对 `group` 拥有写权限。
pub fn group_writable_by(group: &Group, user: &SessionUser) -> bool {
    if user.role.at_least_admin() {
        return true;
    }
    if group.pushed {
        // SEC-1: 被推送的分组必须「允许编辑」且当前用户「确为推送目标」才可写;
        // 否则任意能看到该分组的登录用户都能改它,破坏多租户隔离。
        return group.push_allow_edit && user_is_push_target(group, user);
    }
    group.owner_id == Some(user.id)
}

/// 流式读取响应体,累计超过 `max` 字节立即报错;避免无 Content-Length 或谎报长度的响应撑爆内存。
pub async fn read_body_capped(resp: reqwest::Response, max: u64) -> anyhow::Result<bytes::Bytes> {
    use futures::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if buf.len() as u64 + chunk.len() as u64 > max {
            anyhow::bail!("download too large: exceeds {max} bytes");
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(bytes::Bytes::from(buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Role;
    use chrono::Utc;

    fn session(id: Uuid, role: Role) -> SessionUser {
        SessionUser {
            id,
            role,
            username: "u".into(),
            email: "u@example.com".into(),
        }
    }

    fn pushed_group(
        target_type: &str,
        role: Option<&str>,
        target_user: Option<Uuid>,
        allow_edit: bool,
    ) -> Group {
        Group {
            id: Uuid::new_v4(),
            name: "g".into(),
            icon: "grid".into(),
            owner_id: Some(Uuid::new_v4()),
            pushed: true,
            push_target_type: target_type.into(),
            push_target_role: role.map(|s| s.to_string()),
            push_target_user_id: target_user,
            push_allow_edit: allow_edit,
            sort_order: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            owner_name: None,
        }
    }

    fn owned_group(owner: Option<Uuid>) -> Group {
        Group {
            id: Uuid::new_v4(),
            name: "g".into(),
            icon: "grid".into(),
            owner_id: owner,
            pushed: false,
            push_target_type: "all".into(),
            push_target_role: None,
            push_target_user_id: None,
            push_allow_edit: false,
            sort_order: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            owner_name: None,
        }
    }

    #[test]
    fn admin_can_write_any_group() {
        let admin = session(Uuid::new_v4(), Role::Admin);
        assert!(group_writable_by(&owned_group(Some(Uuid::new_v4())), &admin));
        assert!(group_writable_by(
            &pushed_group("user", None, Some(Uuid::new_v4()), false),
            &admin
        ));
    }

    #[test]
    fn owner_can_write_own_unpushed_group() {
        let uid = Uuid::new_v4();
        let u = session(uid, Role::User);
        assert!(group_writable_by(&owned_group(Some(uid)), &u));
    }

    #[test]
    fn non_owner_cannot_write_others_unpushed_group() {
        let u = session(Uuid::new_v4(), Role::User);
        assert!(!group_writable_by(&owned_group(Some(Uuid::new_v4())), &u));
    }

    #[test]
    fn non_target_user_cannot_write_pushed_editable_group() {
        // SEC-1 回归:分组推给了另一个具体用户,当前用户并非目标,
        // 即便 push_allow_edit=true 也不能写。
        let u = session(Uuid::new_v4(), Role::User);
        let g = pushed_group("user", None, Some(Uuid::new_v4()), true);
        assert!(!group_writable_by(&g, &u));
    }

    #[test]
    fn target_user_can_write_pushed_editable_group() {
        let uid = Uuid::new_v4();
        let u = session(uid, Role::User);
        let g = pushed_group("user", None, Some(uid), true);
        assert!(group_writable_by(&g, &u));
    }

    #[test]
    fn target_all_allows_any_user_when_editable() {
        let u = session(Uuid::new_v4(), Role::User);
        assert!(group_writable_by(&pushed_group("all", None, None, true), &u));
    }

    #[test]
    fn target_role_must_match_user_role() {
        let u = session(Uuid::new_v4(), Role::User);
        assert!(group_writable_by(
            &pushed_group("role", Some("user"), None, true),
            &u
        ));
        assert!(!group_writable_by(
            &pushed_group("role", Some("admin"), None, true),
            &u
        ));
    }

    #[test]
    fn pushed_but_not_editable_is_not_writable_even_for_target() {
        let uid = Uuid::new_v4();
        let u = session(uid, Role::User);
        let g = pushed_group("user", None, Some(uid), false);
        assert!(!group_writable_by(&g, &u));
    }

    // API-1: 推送/系统消息目标一致性校验
    #[test]
    fn validate_push_target_all_ok() {
        let (t, r, u) = validate_push_target("all", None, None).unwrap();
        assert_eq!(t, "all");
        assert!(r.is_none());
        assert!(u.is_none());
    }

    #[test]
    fn validate_push_target_all_rejects_role_or_user() {
        assert!(validate_push_target("all", Some("user"), None).is_err());
        assert!(validate_push_target("all", None, Some(Uuid::new_v4())).is_err());
    }

    #[test]
    fn validate_push_target_role_ok() {
        let (t, r, u) = validate_push_target("role", Some("admin"), None).unwrap();
        assert_eq!(t, "role");
        assert_eq!(r.as_deref(), Some("admin"));
        assert!(u.is_none());
    }

    #[test]
    fn validate_push_target_role_requires_valid_role() {
        // 缺失 role
        assert!(validate_push_target("role", None, None).is_err());
        // 空白 role
        assert!(validate_push_target("role", Some("  "), None).is_err());
        // 非法 role 值
        assert!(validate_push_target("role", Some("bogus"), None).is_err());
    }

    #[test]
    fn validate_push_target_role_rejects_user() {
        assert!(validate_push_target("role", Some("admin"), Some(Uuid::new_v4())).is_err());
    }

    #[test]
    fn validate_push_target_user_ok() {
        let uid = Uuid::new_v4();
        let (t, r, u) = validate_push_target("user", None, Some(uid)).unwrap();
        assert_eq!(t, "user");
        assert!(r.is_none());
        assert_eq!(u, Some(uid));
    }

    #[test]
    fn validate_push_target_user_requires_user_id() {
        assert!(validate_push_target("user", None, None).is_err());
    }

    #[test]
    fn validate_push_target_user_rejects_role() {
        assert!(validate_push_target("user", Some("admin"), Some(Uuid::new_v4())).is_err());
    }

    #[test]
    fn validate_push_target_unknown_type_rejected() {
        assert!(validate_push_target("everyone", None, None).is_err());
        assert!(validate_push_target("", None, None).is_err());
    }
}
