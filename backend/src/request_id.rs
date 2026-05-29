//! OPS-8: 请求 ID(`x-request-id`)生成、校验与传播。
//!
//! 设计:
//! - [`MakeRequestUuid`] 为缺失 `x-request-id` 的请求生成一个 UUID v4。
//! - 入站若带了 `x-request-id`,`SetRequestIdLayer` 会原样信任它(不做任何校验),
//!   因此我们在更外层加 [`sanitize_request_id`] 中间件:对“不合规”(过长 / 含非
//!   可见 ASCII)的入站值直接剥除,从而让 `SetRequestIdLayer` 退化为生成新 ID。
//!   合规的客户端值则被保留,实现端到端链路追踪。
//! - 校验逻辑抽成纯函数 [`is_valid_request_id`],便于单元测试。
//! - 经过 `SetRequestIdLayer` 后,`x-request-id` 必定存在;[`inject_request_id`]
//!   读取它作为 tracing span 的 `request_id` 字段,使每条日志携带请求 ID。

use axum::{extract::Request, http::header::HeaderName, middleware::Next, response::Response};
use tower_http::request_id::{MakeRequestId, RequestId};
use tracing::Instrument;
use uuid::Uuid;

/// `x-request-id` 头名,模块内复用,避免散落字符串字面量。
pub const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// 请求 ID 的最大允许长度。客户端透传的 ID 上限,既防止超长头被原样写回响应/日志
/// (放大攻击面 + 撑大日志),又能容纳 UUID(36)、带前缀的 trace id 等常见格式。
const MAX_REQUEST_ID_LEN: usize = 128;

/// OPS-8(纯函数,便于单元测试):判断入站 `x-request-id` 是否“合规可信任”。
///
/// 规则:非空、长度不超过 [`MAX_REQUEST_ID_LEN`]、且仅含可见 ASCII 字符
/// (0x21..=0x7E,即排除空格与控制字符)。不合规者将被剥除并改为服务端生成。
pub fn is_valid_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_REQUEST_ID_LEN
        && value.bytes().all(|b| b.is_ascii_graphic())
}

/// OPS-8:为缺失 `x-request-id` 的请求生成 UUID v4 作为请求 ID。
#[derive(Clone, Default)]
pub struct MakeRequestUuid;

impl MakeRequestId for MakeRequestUuid {
    fn make_request_id<B>(&mut self, _request: &axum::http::Request<B>) -> Option<RequestId> {
        // UUID v4 的连字符格式始终是合法且可见的 ASCII HeaderValue,故 expect 不会触发。
        let value = Uuid::new_v4()
            .to_string()
            .parse()
            .expect("uuid is a valid header value");
        Some(RequestId::new(value))
    }
}

/// OPS-8:剥除“不合规”的入站 `x-request-id`,让下游 `SetRequestIdLayer` 改为生成
/// 新 ID;合规值保留以支持客户端发起的链路追踪。须置于 `SetRequestIdLayer` 之外
/// (更外层),以便在其读取头之前完成清洗。
pub async fn sanitize_request_id(mut req: Request, next: Next) -> Response {
    let keep = req
        .headers()
        .get(&X_REQUEST_ID)
        .and_then(|v| v.to_str().ok())
        .map(is_valid_request_id)
        .unwrap_or(false);
    if !keep {
        req.headers_mut().remove(&X_REQUEST_ID);
    }
    next.run(req).await
}

/// OPS-8 / OPS(可观测性):把已确定的 `x-request-id` 写入 tracing span,使每条日志
/// 携带请求 ID。须置于 `SetRequestIdLayer` 之内(更内层),此时头必定已存在。
pub async fn inject_request_id(req: Request, next: Next) -> Response {
    let request_id = req
        .headers()
        .get(&X_REQUEST_ID)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
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

#[cfg(test)]
mod tests {
    use super::is_valid_request_id;

    #[test]
    fn accepts_uuid_like_value() {
        assert!(is_valid_request_id("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn accepts_short_token() {
        assert!(is_valid_request_id("abc123"));
        assert!(is_valid_request_id("a"));
    }

    #[test]
    fn rejects_empty() {
        assert!(!is_valid_request_id(""));
    }

    #[test]
    fn rejects_too_long() {
        // 129 个字符,超过 128 上限。
        let long = "a".repeat(129);
        assert!(!is_valid_request_id(&long));
        // 恰好 128 合规。
        assert!(is_valid_request_id(&"a".repeat(128)));
    }

    #[test]
    fn rejects_whitespace_and_control_chars() {
        assert!(!is_valid_request_id("has space"));
        assert!(!is_valid_request_id("line\nbreak"));
        assert!(!is_valid_request_id("tab\tchar"));
    }

    #[test]
    fn rejects_non_ascii() {
        assert!(!is_valid_request_id("请求-id"));
    }
}
