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
            if target_role
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .is_some()
            {
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
            if target_role
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .is_some()
            {
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

/// 拒绝携带 JavaScript / 外部资源、无法安全清洗的 SVG。
/// NavHub 以 `<img src>` 渲染 SVG(无脚本执行上下文),但预签名直链可能被直接在
/// 浏览器标签打开,故仍需拦截。封禁:<script>、on* 内联事件处理器、
/// javascript:/data:text/html URI、<foreignObject>、`<style>@import` 等。
///
/// API-6: 提取为共享纯函数,供手动上传、导入、以及抓取入库三条路径统一使用。
pub fn scan_svg_for_active_content(bytes: &[u8]) -> Result<(), &'static str> {
    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return Err("not valid UTF-8"),
    };
    let lower = text.to_ascii_lowercase();

    if lower.contains("<script") || lower.contains("</script") {
        return Err("contains <script>");
    }
    if lower.contains("<foreignobject") {
        return Err("contains <foreignObject>");
    }
    if lower.contains("javascript:") || lower.contains("vbscript:") {
        return Err("contains script: URI");
    }
    if lower.contains("data:text/html") || lower.contains("data:application/xhtml") {
        return Err("contains data:text/html");
    }
    if lower.contains("@import") {
        return Err("contains @import");
    }
    if has_event_handler(&lower) {
        return Err("contains inline event handler");
    }
    Ok(())
}

fn has_event_handler(lower: &str) -> bool {
    let bytes = lower.as_bytes();
    for i in 0..bytes.len().saturating_sub(3) {
        let c = bytes[i];
        let is_attr_boundary = c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' || c == b'\x0c';
        if !is_attr_boundary {
            continue;
        }
        if bytes.get(i + 1).copied() != Some(b'o') || bytes.get(i + 2).copied() != Some(b'n') {
            continue;
        }
        let mut j = i + 3;
        let mut saw_letter = false;
        while j < bytes.len() && bytes[j].is_ascii_lowercase() {
            saw_letter = true;
            j += 1;
        }
        if !saw_letter {
            continue;
        }
        while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'\t') {
            j += 1;
        }
        if bytes.get(j).copied() == Some(b'=') {
            return true;
        }
    }
    false
}

/// API-5: 分页参数最大每页条数。
pub const MAX_PAGE_LIMIT: i64 = 200;

/// API-5: 收紧分页 limit/offset 的纯函数。limit 钳到 [1, MAX_PAGE_LIMIT],
/// offset 取非负;避免 limit=0/超大或 offset 为负导致的全表扫描/异常。
pub fn clamp_page(limit: i64, offset: i64) -> (i64, i64) {
    (limit.clamp(1, MAX_PAGE_LIMIT), offset.max(0))
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

/// QUAL-8: 抓取入库下载的「共享前半段」——壁纸与图标两条 download_to_storage 此前
/// 各自重复了同一段逻辑:SEC-10 SSRF 校验(禁私网/内网/云元数据)、HTTP 状态校验、
/// Content-Length 预检、SEC-6 流式限额读取。这里收敛为单一 helper,返回响应体字节与
/// 解析后的 content-type(分号前主类型,空则 application/octet-stream)。
///
/// 调用方各自接续其类型特化的尾段(壁纸:imagesize 测量 + 按内容类型定扩展名;
/// 图标:SVG 活动内容扫描 + 固定 svg 扩展名)。下载客户端须已禁用自动重定向
/// (调用方传入,见 SEC-10),否则 302 可绕过此处的 SSRF 校验。
pub async fn fetch_remote_capped(
    client: &reqwest::Client,
    url: &str,
    max_bytes: u64,
) -> anyhow::Result<(bytes::Bytes, String)> {
    // SEC-10: 抓取来的 URL 其内容站点可控,下载前做 SSRF 校验。
    let host = crate::handlers::favicon::extract_host(url)
        .ok_or_else(|| anyhow::anyhow!("invalid download url: {url}"))?;
    crate::handlers::favicon::ensure_safe_target(&host, false)
        .await
        .map_err(|e| anyhow::anyhow!("blocked download target {host}: {e:?}"))?;

    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("http {} downloading {url}", resp.status());
    }

    // Content-Length 若存在则预检,避免明显超限的下载白跑流式阶段。
    if let Some(cl) = resp.content_length() {
        if cl > max_bytes {
            anyhow::bail!("file too large: {cl} bytes > {max_bytes}");
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_string();

    // SEC-6: 流式读取并限额。
    let bytes = read_body_capped(resp, max_bytes).await?;
    Ok((bytes, content_type))
}

/// QUAL-8 / INFRA-2: SHA-256 十六进制摘要,纯函数(便于单测)。哈希是 CPU 密集型,
/// 大文件场景请用 `sha256_hex_blocking` 包到 spawn_blocking,避免阻塞 tokio 运行时。
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

/// QUAL-8 / INFRA-2: 在 spawn_blocking 上计算 SHA-256,避免阻塞异步运行时。Bytes 是
/// Arc 背书,clone 仅计数 +1、不复制底层数据。两条 download_to_storage 共用。
pub async fn sha256_hex_blocking(bytes: bytes::Bytes) -> anyhow::Result<String> {
    tokio::task::spawn_blocking(move || sha256_hex(&bytes))
        .await
        .map_err(|e| anyhow::anyhow!("hash task failed: {e}"))
}

/// DATA-9: 校验 `bytes` 的 SHA-256 是否等于 `expected_hex`(十六进制摘要)。导入侧用于
/// 校验内嵌资产的完整性,不匹配则拒绝。比较大小写不敏感、两侧空白裁剪;`expected_hex`
/// 非法(长度/字符不对)时返回 false(视为校验失败)。纯函数,便于单测。
pub fn verify_sha256(bytes: &[u8], expected_hex: &str) -> bool {
    let expected = expected_hex.trim();
    // SHA-256 摘要固定 64 个十六进制字符;长度不符或含非法字符直接判失败。
    if expected.len() != 64 || !expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return false;
    }
    sha256_hex(bytes).eq_ignore_ascii_case(expected)
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
        assert!(group_writable_by(
            &owned_group(Some(Uuid::new_v4())),
            &admin
        ));
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
        assert!(group_writable_by(
            &pushed_group("all", None, None, true),
            &u
        ));
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

    // API-5: 分页参数钳制
    #[test]
    fn clamp_page_normal_values_unchanged() {
        assert_eq!(clamp_page(50, 0), (50, 0));
        assert_eq!(clamp_page(200, 100), (200, 100));
        assert_eq!(clamp_page(1, 0), (1, 0));
    }

    #[test]
    fn clamp_page_limit_zero_becomes_one() {
        assert_eq!(clamp_page(0, 0), (1, 0));
    }

    #[test]
    fn clamp_page_limit_negative_becomes_one() {
        assert_eq!(clamp_page(-5, 0), (1, 0));
    }

    #[test]
    fn clamp_page_huge_limit_capped_to_max() {
        assert_eq!(clamp_page(10_000, 0), (MAX_PAGE_LIMIT, 0));
        assert_eq!(clamp_page(i64::MAX, 0), (MAX_PAGE_LIMIT, 0));
    }

    #[test]
    fn clamp_page_negative_offset_becomes_zero() {
        assert_eq!(clamp_page(50, -100), (50, 0));
        assert_eq!(clamp_page(50, i64::MIN), (50, 0));
    }

    // API-6: SVG 活动内容扫描
    #[test]
    fn scan_svg_clean_passes() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_ok());
    }

    #[test]
    fn scan_svg_with_script_flagged() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_err());
    }

    #[test]
    fn scan_svg_with_event_handler_flagged() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="evil()" /></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_err());
    }

    #[test]
    fn scan_svg_with_javascript_uri_flagged() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_err());
    }

    #[test]
    fn scan_svg_with_foreign_object_flagged() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_err());
    }

    #[test]
    fn scan_svg_with_css_import_flagged() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(evil.css)</style></svg>"#;
        assert!(scan_svg_for_active_content(svg).is_err());
    }

    // QUAL-8: SHA-256 十六进制摘要(已知向量)。
    #[test]
    fn sha256_hex_known_vectors() {
        // 空输入与 "abc" 的 SHA-256 标准向量。
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_hex_is_lowercase_64_hex() {
        let h = sha256_hex(b"navhub");
        assert_eq!(h.len(), 64);
        assert!(h
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    // DATA-9: 导入完整性校验。
    #[test]
    fn verify_sha256_matching_returns_true() {
        let expected = sha256_hex(b"hello world");
        assert!(verify_sha256(b"hello world", &expected));
        // 大小写不敏感 + 两侧空白裁剪。
        assert!(verify_sha256(
            b"hello world",
            &format!("  {}  ", expected.to_uppercase())
        ));
    }

    #[test]
    fn verify_sha256_mismatch_returns_false() {
        let expected = sha256_hex(b"hello world");
        assert!(!verify_sha256(b"goodbye world", &expected));
    }

    #[test]
    fn verify_sha256_bad_hex_returns_false() {
        // 长度不对。
        assert!(!verify_sha256(b"x", "abc"));
        // 含非十六进制字符(64 长度但有 g/z)。
        let bad: String = "g".repeat(64);
        assert!(!verify_sha256(b"x", &bad));
        // 空串。
        assert!(!verify_sha256(b"x", ""));
    }
}
