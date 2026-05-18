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
            presign_ttl_secs: s3.presign_ttl_secs.max(60),
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
