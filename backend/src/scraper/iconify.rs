use crate::scraper::{IconScraper, ScrapedIconAsset};
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct IconifyCollection {
    prefix: String,
    total: u32,
    uncategorized: Option<Vec<String>>,
    categories: Option<HashMap<String, Vec<String>>>,
}

pub struct IconifyScraper;

impl IconifyScraper {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl IconScraper for IconifyScraper {
    async fn scrape(&self, site_url: &str, _batch_size: usize) -> Result<Vec<ScrapedIconAsset>> {
        let mut all_icons = Vec::new();
        // INFRA-1: 此前用 reqwest::Client::new() 无任何超时,慢/恶意主机可让任务无限挂起。
        // 改为带连接超时(10s)与整体请求超时(30s)的客户端。
        let client = reqwest::Client::builder()
            .user_agent("NavHub/1.0")
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        // Allow multiple urls separated by comma, space or newline
        for url_str in site_url.split(|c| c == '\n' || c == ',' || c == ' ') {
            let url_str = url_str.trim();
            if url_str.is_empty() { continue; }
            
            // Extract prefix from e.g. https://icon-sets.iconify.design/streamline-kameleon-color/page-7.html
            // Or just raw prefix e.g. streamline-kameleon-color
            let prefix = if url_str.starts_with("http") {
                let parts: Vec<&str> = url_str.split('/').collect();
                // For https://icon-sets.iconify.design/PREFIX/...
                if parts.len() >= 4 {
                    parts[3].to_string()
                } else {
                    continue;
                }
            } else {
                url_str.to_string()
            };
            
            let api_url = format!("https://api.iconify.design/collection?prefix={}", prefix);
            let resp = match client.get(&api_url).send().await {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!("Iconify scraper failed to fetch {}: {}", api_url, e);
                    continue;
                }
            };
            
            if !resp.status().is_success() {
                continue;
            }
            
            let data: IconifyCollection = match resp.json().await {
                Ok(d) => d,
                Err(e) => {
                    tracing::warn!("Iconify scraper failed to parse json {}: {}", api_url, e);
                    continue;
                }
            };
            
            let mut icon_names = Vec::new();
            if let Some(uncat) = data.uncategorized {
                icon_names.extend(uncat);
            }
            if let Some(cats) = data.categories {
                for icons in cats.values() {
                    icon_names.extend(icons.clone());
                }
            }
            
            for name in icon_names.into_iter() {
                all_icons.push(ScrapedIconAsset {
                    title: Some(name.clone()),
                    svg_url: format!("https://api.iconify.design/{}/{}.svg?width=auto&height=auto", prefix, name),
                    author: Some("Iconify".to_string()),
                });
            }
        }
        
        Ok(all_icons)
    }
}
