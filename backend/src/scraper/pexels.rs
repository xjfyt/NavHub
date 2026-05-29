use super::{truncate_title, ScrapedWallpaper, Scraper, MIN_IMAGE_DIMENSION};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::HashSet;
use url::Url;

const DEFAULT_PEXELS_QUERY: &str = "nature landscape scenic mountains ocean forest waterfall";
const MIN_WALLPAPER_WIDTH: u32 = 2560;
const MIN_WALLPAPER_HEIGHT: u32 = 1440;
const MIN_ASPECT_RATIO: f32 = 1.45;
const MAX_ASPECT_RATIO: f32 = 2.40;
const MIN_AVG_SATURATION: f32 = 0.12;
const MIN_AVG_LUMINANCE: f32 = 0.08;
const MAX_AVG_LUMINANCE: f32 = 0.92;

pub struct PexelsScraper {
    client: reqwest::Client,
}

impl PexelsScraper {
    pub fn new() -> Result<Self> {
        // INFRA-8: 构造失败向上传播,不再 unwrap_or_default 静默退化。
        let client = super::build_scraper_client("NavHub/1.0")?;
        Ok(Self { client })
    }
}

#[derive(Debug, Deserialize)]
struct PexelsResp {
    photos: Vec<PexelsPhoto>,
}

#[derive(Debug, Deserialize)]
struct PexelsPhoto {
    url: String,
    photographer: String,
    alt: Option<String>,
    #[serde(default)]
    avg_color: Option<String>,
    src: PexelsSrc,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
}

#[derive(Debug, Deserialize)]
struct PexelsSrc {
    original: String,
    medium: String,
}

#[async_trait::async_trait]
impl Scraper for PexelsScraper {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        // site_url example:
        // https://api.pexels.com/v1/search?query=nature+landscape&orientation=landscape&size=large&per_page=80&api_key=YOUR_KEY
        // api_key is extracted and sent as Authorization header per Pexels docs.
        let req = PexelsRequest::from_site_url(site_url, batch_size)?;
        let mut results = Vec::new();
        let mut seen = HashSet::new();

        for page in 0..req.max_pages {
            let url = req.page_url(page);
            let mut http_req = self.client.get(url.as_str());
            if let Some(api_key) = req.api_key.as_deref() {
                http_req = http_req.header("Authorization", api_key);
            }

            let resp: PexelsResp = http_req
                .send()
                .await
                .context("pexels api fetch")?
                .error_for_status()
                .context("pexels api error")?
                .json()
                .await
                .context("pexels api parse")?;

            if resp.photos.is_empty() {
                break;
            }

            for photo in resp.photos {
                if results.len() >= batch_size {
                    break;
                }
                if !seen.insert(photo.src.original.clone()) || !is_quality_wallpaper(&photo) {
                    continue;
                }

                results.push(ScrapedWallpaper {
                    title: truncate_title(photo.alt, 80),
                    video_url: photo.src.original,
                    thumbnail_url: Some(photo.src.medium),
                    page_url: Some(photo.url),
                    author: Some(photo.photographer),
                    media_type: "image".to_string(),
                });
            }

            if results.len() >= batch_size {
                break;
            }
        }

        Ok(results)
    }
}

struct PexelsRequest {
    base_url: Url,
    params: Vec<(String, String)>,
    api_key: Option<String>,
    start_page: u32,
    per_page: usize,
    max_pages: usize,
}

impl PexelsRequest {
    fn from_site_url(site_url: &str, batch_size: usize) -> Result<Self> {
        let parsed = Url::parse(site_url).context("pexels source url parse")?;
        let mut base_url = parsed.clone();
        base_url.set_query(None);

        let mut api_key = None;
        let mut start_page = 1u32;
        let mut params = Vec::new();

        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "api_key" => api_key = Some(value.into_owned()),
                "page" => start_page = value.parse().unwrap_or(1).max(1),
                "per_page" => {}
                _ => params.push((key.into_owned(), value.into_owned())),
            }
        }

        if is_curated_endpoint(base_url.path()) {
            base_url.set_path("/v1/search");
        }

        ensure_param(&mut params, "query", DEFAULT_PEXELS_QUERY);
        ensure_param(&mut params, "orientation", "landscape");
        ensure_param(&mut params, "size", "large");

        Ok(Self {
            base_url,
            params,
            api_key: api_key.filter(|key| !key.trim().is_empty()),
            start_page,
            per_page: (batch_size * 4).clamp(30, 80),
            max_pages: 5,
        })
    }

    fn page_url(&self, page_offset: usize) -> Url {
        let mut url = self.base_url.clone();
        {
            let mut pairs = url.query_pairs_mut();
            for (key, value) in &self.params {
                pairs.append_pair(key, value);
            }
            pairs.append_pair("per_page", &self.per_page.to_string());
            pairs.append_pair("page", &(self.start_page + page_offset as u32).to_string());
        }
        url
    }
}

fn is_curated_endpoint(path: &str) -> bool {
    path.trim_end_matches('/').ends_with("/v1/curated")
}

fn ensure_param(params: &mut Vec<(String, String)>, key: &str, default_value: &str) {
    if params.iter().any(|(k, v)| k == key && !v.trim().is_empty()) {
        return;
    }
    params.push((key.to_string(), default_value.to_string()));
}

fn is_quality_wallpaper(photo: &PexelsPhoto) -> bool {
    if !is_high_resolution_landscape(photo.width, photo.height) {
        return false;
    }

    let subject = normalized_subject(photo);
    if has_any_phrase(&subject, BLOCKED_PHRASES) || has_any_token(&subject, PEOPLE_TOKENS) {
        return false;
    }

    if let Some((saturation, luminance)) = photo
        .avg_color
        .as_deref()
        .and_then(avg_color_saturation_luminance)
    {
        if saturation < MIN_AVG_SATURATION
            || !(MIN_AVG_LUMINANCE..=MAX_AVG_LUMINANCE).contains(&luminance)
        {
            return false;
        }
    }

    true
}

fn is_high_resolution_landscape(width: u32, height: u32) -> bool {
    if width < MIN_WALLPAPER_WIDTH || height < MIN_WALLPAPER_HEIGHT {
        return false;
    }
    let min_side = width.min(height);
    if min_side < MIN_IMAGE_DIMENSION {
        return false;
    }

    let ratio = width as f32 / height as f32;
    width > height && (MIN_ASPECT_RATIO..=MAX_ASPECT_RATIO).contains(&ratio)
}

fn normalized_subject(photo: &PexelsPhoto) -> String {
    let mut raw = String::new();
    if let Some(alt) = &photo.alt {
        raw.push_str(alt);
    }
    raw.push(' ');
    raw.push_str(&photo.url);

    let normalized: String = raw
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c.is_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect();
    format!(" {normalized} ")
}

fn has_any_phrase(subject: &str, phrases: &[&str]) -> bool {
    phrases
        .iter()
        .any(|phrase| subject.contains(&format!(" {phrase} ")))
}

fn has_any_token(subject: &str, tokens: &[&str]) -> bool {
    subject
        .split_whitespace()
        .any(|word| tokens.iter().any(|token| word == *token))
}

fn avg_color_saturation_luminance(hex: &str) -> Option<(f32, f32)> {
    let hex = hex.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }

    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;

    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let saturation = if max == 0.0 { 0.0 } else { (max - min) / max };
    let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    Some((saturation, luminance))
}

const PEOPLE_TOKENS: &[&str] = &[
    "person", "people", "human", "woman", "women", "man", "men", "girl", "girls", "boy", "boys",
    "child", "children", "baby", "face", "model", "portrait", "selfie", "hand", "hands", "bride",
    "groom", "dancer", "athlete", "couple", "crowd", "family", "lady", "guy",
];

const BLOCKED_PHRASES: &[&str] = &[
    "black and white",
    "grayscale",
    "grey scale",
    "gray scale",
    "monochrome",
    "close up",
    "closeup",
    "indoor",
    "office",
    "living room",
    "bed room",
    "bedroom",
    "fashion",
    "makeup",
    "phone",
    "laptop",
    "text",
    "logo",
    "sign",
];
