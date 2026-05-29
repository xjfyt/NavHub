use crate::{
    config::AppConfig,
    error::{AppError, AppResult},
};
use anyhow::anyhow;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{config::Region, presigning::PresigningConfig, primitives::ByteStream, Client};
use bytes::Bytes;
use std::time::Duration;

pub struct Storage {
    client: Client,
    bucket: String,
    key_prefix: String,
    presign_ttl_secs: u64,
}

impl Storage {
    pub async fn from_config(cfg: &AppConfig) -> anyhow::Result<Self> {
        let s3 = &cfg.storage.s3;
        if s3.endpoint.trim().is_empty() {
            return Err(anyhow!("storage.s3.endpoint is required"));
        }
        if s3.bucket.trim().is_empty() {
            return Err(anyhow!("storage.s3.bucket is required"));
        }
        if s3.access_key.trim().is_empty() || s3.secret_key.trim().is_empty() {
            return Err(anyhow!(
                "storage.s3.access_key and storage.s3.secret_key are required"
            ));
        }

        let endpoint = s3.endpoint.trim_end_matches('/').to_string();
        let creds = Credentials::new(
            s3.access_key.clone(),
            s3.secret_key.clone(),
            None,
            None,
            "navhub-config",
        );
        let shared_cfg = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(s3.region.clone()))
            .endpoint_url(endpoint)
            .credentials_provider(creds)
            .load()
            .await;
        let mut s3_cfg = aws_sdk_s3::config::Builder::from(&shared_cfg);
        if s3.path_style {
            s3_cfg = s3_cfg.force_path_style(true);
        }

        Ok(Self {
            client: Client::from_conf(s3_cfg.build()),
            bucket: s3.bucket.clone(),
            key_prefix: normalize_key_prefix(&s3.key_prefix),
            presign_ttl_secs: clamp_presign_ttl(s3.presign_ttl_secs),
        })
    }

    pub async fn put_bytes(
        &self,
        public_name: &str,
        content_type: Option<&str>,
        data: Bytes,
    ) -> AppResult<()> {
        let key = self.object_key(public_name)?;
        let mut req = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data));
        if let Some(ct) = content_type.filter(|v| !v.is_empty()) {
            req = req.content_type(ct);
        }
        req.send()
            .await
            .map_err(|e| AppError::Internal(format!("s3 put_object failed: {e}")))?;
        Ok(())
    }

    pub async fn presign_get_url(&self, public_name: &str) -> AppResult<String> {
        let key = self.object_key(public_name)?;
        let cfg = PresigningConfig::expires_in(Duration::from_secs(self.presign_ttl_secs))
            .map_err(|e| AppError::Internal(format!("invalid s3 presign ttl: {e}")))?;
        let presigned = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(cfg)
            .await
            .map_err(|e| AppError::Internal(format!("s3 presign failed: {e}")))?;
        Ok(presigned.uri().to_string())
    }

    pub async fn get_bytes(&self, public_name: &str) -> AppResult<(Bytes, Option<String>)> {
        let key = self.object_key(public_name)?;
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("s3 get_object failed: {e}")))?;
        let content_type = resp.content_type().map(|v| v.to_string());
        let data = resp
            .body
            .collect()
            .await
            .map_err(|e| AppError::Internal(format!("s3 read_object failed: {e}")))?
            .into_bytes();
        Ok((data, content_type))
    }

    /// DATA-3: 删除单个对象(隐私/合规:删除用户/壁纸/图标时清理其 S3 blob)。
    /// `public_name` 与 put/get 一致,是不含 key_prefix 的相对 key。S3 DeleteObject
    /// 对不存在的 key 也返回成功(幂等),因此重复清理是安全的。
    pub async fn delete_object(&self, public_name: &str) -> AppResult<()> {
        let key = self.object_key(public_name)?;
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("s3 delete_object failed: {e}")))?;
        Ok(())
    }

    /// DATA-3: 批量删除对象。空列表是 no-op。S3 DeleteObjects 单次最多 1000 个 key,
    /// 这里按 1000 分批。无法识别 / 空 key 已由调用方过滤,这里只接收合法 key。
    pub async fn delete_objects(&self, public_names: &[String]) -> AppResult<()> {
        use aws_sdk_s3::types::{Delete, ObjectIdentifier};
        for chunk in public_names.chunks(S3_DELETE_BATCH) {
            let mut ids: Vec<ObjectIdentifier> = Vec::with_capacity(chunk.len());
            for name in chunk {
                let key = self.object_key(name)?;
                let oid = ObjectIdentifier::builder()
                    .key(key)
                    .build()
                    .map_err(|e| AppError::Internal(format!("s3 object id build failed: {e}")))?;
                ids.push(oid);
            }
            let delete = Delete::builder()
                .set_objects(Some(ids))
                .quiet(true)
                .build()
                .map_err(|e| AppError::Internal(format!("s3 delete payload build failed: {e}")))?;
            self.client
                .delete_objects()
                .bucket(&self.bucket)
                .delete(delete)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("s3 delete_objects failed: {e}")))?;
        }
        Ok(())
    }

    /// OPS-10: 浅层 S3 可达性探测,供 `/readyz` 可选启用。用最便宜的 HeadBucket
    /// (仅校验桶可达/有权限,不传输对象),并由调用方用短超时兜底,绝不让就绪探测
    /// 因对象存储慢/挂而长时间阻塞。返回 Ok(()) 表示可达。
    pub async fn health_check(&self) -> anyhow::Result<()> {
        self.client
            .head_bucket()
            .bucket(&self.bucket)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("s3 head_bucket failed: {e}"))?;
        Ok(())
    }

    fn object_key(&self, public_name: &str) -> AppResult<String> {
        let public_name = sanitize_public_name(public_name)?;
        if self.key_prefix.is_empty() {
            Ok(public_name)
        } else {
            Ok(format!("{}/{}", self.key_prefix, public_name))
        }
    }
}

fn sanitize_public_name(name: &str) -> AppResult<String> {
    let name = name.trim().trim_matches('/');
    if name.is_empty() || name.contains("..") || name.contains('\\') || name.starts_with('/') {
        return Err(AppError::BadRequest("invalid object path".into()));
    }
    Ok(name.to_string())
}

fn normalize_key_prefix(prefix: &str) -> String {
    prefix.trim().trim_matches('/').to_string()
}

/// DATA-3: 把数据库里持久化的「访问值」(形如 `/uploads/icons/<sha>.png`,或带
/// 域名的完整 URL `https://host/uploads/...`,可能携带 `?`/`#`)还原成可用于
/// S3 删除的对象 key(`icons/<sha>.png`,即 `object_key` 里再拼 key_prefix 之前
/// 的那一段 public_name)。来源:头像 `users.avatar_url`、`library_icons.url`、
/// `icons.image_url` 等。无法识别 / 含路径穿越 / 为空时返回 None(跳过,绝不
/// 误删)。纯函数,可单测。逻辑此前散落在 handlers/admin/push.rs,这里收敛为
/// storage 的权威实现。
pub fn key_from_stored_value(stored: &str) -> Option<String> {
    let trimmed = stored.trim();
    if let Some(rest) = trimmed.strip_prefix("/uploads/") {
        return clean_object_key(rest);
    }
    if let Ok(parsed) = url::Url::parse(trimmed) {
        if let Some(rest) = parsed.path().strip_prefix("/uploads/") {
            return clean_object_key(rest);
        }
    }
    None
}

fn clean_object_key(value: &str) -> Option<String> {
    let key = value
        .trim_start_matches('/')
        .split(['?', '#'])
        .next()?
        .trim();
    if key.is_empty() || key.contains("..") || key.contains('\\') {
        return None;
    }
    Some(key.to_string())
}

/// INFRA-10: 预签名 URL 的有效期完全来自配置输入,未经约束时可能为 0(立即失效)
/// 或大到离谱(几乎永不过期,等同于公开)。统一夹取到 [60s, 86400s] 区间:
/// 低于 1 分钟不实用、超过 1 天的预签名链接安全性极差。
fn clamp_presign_ttl(ttl: u64) -> u64 {
    ttl.clamp(MIN_PRESIGN_TTL_SECS, MAX_PRESIGN_TTL_SECS)
}

const MIN_PRESIGN_TTL_SECS: u64 = 60;
const MAX_PRESIGN_TTL_SECS: u64 = 86_400;

/// DATA-3: S3 DeleteObjects 单次请求最多 1000 个 key。
const S3_DELETE_BATCH: usize = 1000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_below_min_to_floor() {
        assert_eq!(clamp_presign_ttl(0), 60);
        assert_eq!(clamp_presign_ttl(59), 60);
    }

    #[test]
    fn clamps_above_max_to_ceiling() {
        assert_eq!(clamp_presign_ttl(86_401), 86_400);
        assert_eq!(clamp_presign_ttl(u64::MAX), 86_400);
    }

    #[test]
    fn leaves_in_range_unchanged() {
        assert_eq!(clamp_presign_ttl(60), 60);
        assert_eq!(clamp_presign_ttl(3600), 3600);
        assert_eq!(clamp_presign_ttl(86_400), 86_400);
    }

    // DATA-3: stored value -> S3 key extraction.
    #[test]
    fn key_from_relative_uploads_path() {
        assert_eq!(
            key_from_stored_value("/uploads/icons/abc123.png").as_deref(),
            Some("icons/abc123.png")
        );
        assert_eq!(
            key_from_stored_value("/uploads/avatars/deadbeef.webp").as_deref(),
            Some("avatars/deadbeef.webp")
        );
    }

    #[test]
    fn key_from_absolute_url() {
        assert_eq!(
            key_from_stored_value("https://cdn.example.com/uploads/icons/abc.png").as_deref(),
            Some("icons/abc.png")
        );
    }

    #[test]
    fn key_strips_query_and_fragment() {
        assert_eq!(
            key_from_stored_value("/uploads/icons/abc.png?v=2").as_deref(),
            Some("icons/abc.png")
        );
        assert_eq!(
            key_from_stored_value("/uploads/icons/abc.png#frag").as_deref(),
            Some("icons/abc.png")
        );
    }

    #[test]
    fn key_trims_whitespace_and_leading_slashes() {
        assert_eq!(
            key_from_stored_value("  /uploads//icons/abc.png  ").as_deref(),
            Some("icons/abc.png")
        );
    }

    #[test]
    fn key_rejects_non_uploads_and_empty() {
        assert_eq!(key_from_stored_value(""), None);
        assert_eq!(key_from_stored_value("   "), None);
        // External avatar (e.g. from OIDC) — not one of our objects, never delete it.
        assert_eq!(key_from_stored_value("https://gravatar.com/avatar/x"), None);
        assert_eq!(key_from_stored_value("/static/foo.png"), None);
        assert_eq!(key_from_stored_value("icons/abc.png"), None);
    }

    #[test]
    fn key_rejects_path_traversal() {
        assert_eq!(key_from_stored_value("/uploads/../secret"), None);
        assert_eq!(key_from_stored_value("/uploads/icons/..\\evil.png"), None);
        // Empty after trimming the prefix.
        assert_eq!(key_from_stored_value("/uploads/"), None);
    }
}
