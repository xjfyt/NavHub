pub mod bing;
pub mod desktophut;
pub mod iconify;
pub mod nasa;
pub mod pexels;
pub mod pixabay;
pub mod unsplash;
pub mod wallhaven;
pub mod wikimedia;

use anyhow::Result;
use std::sync::OnceLock;

/// INFRA-8: 此前各爬虫在 new() 里用 `build().unwrap_or_default()` 构造客户端,
/// 一旦构建失败(如 TLS 后端初始化错误)会被静默吞掉、退化成一个无超时、无 UA 的
/// 默认客户端,反而更危险。统一改用此 helper 集中构造并向上传播错误。
/// 同时承载 INFRA-1 的超时:连接超时 10s、整体请求超时 30s。
pub(crate) fn build_scraper_client(user_agent: &str) -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(user_agent.to_string())
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
}

/// QUAL-7: 大多数爬虫(nasa/unsplash/wallhaven/pexels/pixabay/iconify)都用同一个
/// `NavHub/1.0` UA 的客户端。INFRA-8 已把构造收敛到 `build_scraper_client`,但每个
/// 爬虫在 `new()` 里仍各建一个独立 `reqwest::Client`(各自维护连接池)。这里再进一步:
/// 用进程级 `OnceLock` 复用单个共享客户端,既统一配置又共用连接池,避免重复构建。
///
/// `reqwest::Client` 内部是 `Arc`,clone 仅计数 +1。构造失败时返回 `Err` 向上传播,
/// 绝不退化成无超时的默认客户端(沿用 INFRA-8 的语义)。
pub(crate) const DEFAULT_SCRAPER_USER_AGENT: &str = "NavHub/1.0";

pub(crate) fn default_client() -> reqwest::Result<reqwest::Client> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c.clone());
    }
    // 首次构造可能失败(TLS 后端初始化等)——失败不写入 OnceLock,向上传播错误,
    // 留待下次再试;成功则缓存并复用。
    let built = build_scraper_client(DEFAULT_SCRAPER_USER_AGENT)?;
    // 与并发首次构造竞争时,以先写入者为准,统一复用同一个实例。
    Ok(CLIENT.get_or_init(|| built).clone())
}

#[derive(Debug, Clone)]
pub struct ScrapedWallpaper {
    pub title: Option<String>,
    pub video_url: String,
    pub thumbnail_url: Option<String>,
    pub page_url: Option<String>,
    pub author: Option<String>,
    pub media_type: String,
}

/// 截断标题至最多 max_chars 个 Unicode 字符，超出则追加省略号。
pub fn truncate_title(title: Option<String>, max_chars: usize) -> Option<String> {
    title.and_then(|t| {
        let trimmed = t.trim().to_string();
        if trimmed.is_empty() {
            return None;
        }
        let count = trimmed.chars().count();
        if count <= max_chars {
            Some(trimmed)
        } else {
            let truncated: String = trimmed.chars().take(max_chars).collect();
            Some(format!("{truncated}…"))
        }
    })
}

/// 高清判定：图像最短边阈值（像素）。
pub const MIN_IMAGE_DIMENSION: u32 = 1080;
pub const MIN_WALLPAPER_WIDTH: u32 = 1920;
pub const MIN_WALLPAPER_HEIGHT: u32 = 1080;
pub const MIN_WALLPAPER_ASPECT_RATIO: f32 = 1.45;
pub const MAX_WALLPAPER_ASPECT_RATIO: f32 = 2.45;

pub fn is_wallpaper_dimensions(width: u32, height: u32) -> bool {
    if width < MIN_WALLPAPER_WIDTH || height < MIN_WALLPAPER_HEIGHT {
        return false;
    }
    let ratio = width as f32 / height as f32;
    width > height && (MIN_WALLPAPER_ASPECT_RATIO..=MAX_WALLPAPER_ASPECT_RATIO).contains(&ratio)
}

pub fn is_blocked_wallpaper_subject(text: &str) -> bool {
    let normalized = normalize_subject(text);
    has_any_phrase(&normalized, BLOCKED_WALLPAPER_PHRASES)
        || has_any_token(&normalized, BLOCKED_WALLPAPER_TOKENS)
}

fn normalize_subject(text: &str) -> String {
    let normalized: String = text
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
        .any(|word| tokens.contains(&word))
}

const BLOCKED_WALLPAPER_TOKENS: &[&str] = &[
    "person", "people", "human", "woman", "women", "man", "men", "girl", "girls", "boy", "boys",
    "child", "children", "baby", "face", "model", "portrait", "selfie", "hand", "hands", "bride",
    "groom", "dancer", "athlete", "couple", "crowd", "family", "fashion", "makeup", "office",
    "laptop", "phone", "text", "logo", "sign",
];

const BLOCKED_WALLPAPER_PHRASES: &[&str] = &[
    "black and white",
    "grayscale",
    "grey scale",
    "gray scale",
    "monochrome",
    "close up",
    "closeup",
    "living room",
    "bed room",
    "bedroom",
    "screen shot",
    "screenshot",
];

#[async_trait::async_trait]
pub trait Scraper: Send + Sync {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedWallpaper>>;
}

/// No-op scraper for the built-in curated source; wallpapers are seeded via migration.
struct BuiltinScraper;

#[async_trait::async_trait]
impl Scraper for BuiltinScraper {
    async fn scrape(&self, _site_url: &str, _batch_size: usize) -> Result<Vec<ScrapedWallpaper>> {
        Ok(vec![])
    }
}

pub fn get_scraper(scraper_type: &str) -> Result<Box<dyn Scraper>> {
    // INFRA-8: 构造失败时向上传播,而非静默退化成默认客户端。
    Ok(match scraper_type {
        "builtin" => Box::new(BuiltinScraper),
        "bing" => Box::new(bing::BingScraper::new()?),
        "desktophut" => Box::new(desktophut::DesktopHutScraper::new()?),
        "wikimedia" => Box::new(wikimedia::WikimediaScraper::new()?),
        "nasa" => Box::new(nasa::NasaScraper::new()?),
        "unsplash" => Box::new(unsplash::UnsplashScraper::new()?),
        "wallhaven" => Box::new(wallhaven::WallhavenScraper::new()?),
        "pexels" => Box::new(pexels::PexelsScraper::new()?),
        "pixabay" => Box::new(pixabay::PixabayScraper::new()?),
        _ => Box::new(desktophut::DesktopHutScraper::new()?),
    })
}

#[derive(Debug, Clone)]
pub struct ScrapedIconAsset {
    pub title: Option<String>,
    pub svg_url: String,
    pub author: Option<String>,
}

#[async_trait::async_trait]
pub trait IconScraper: Send + Sync {
    async fn scrape(&self, site_url: &str, batch_size: usize) -> Result<Vec<ScrapedIconAsset>>;
}

pub fn get_icon_scraper(scraper_type: &str) -> Result<Box<dyn IconScraper>> {
    // QUAL-7: IconifyScraper::new() 现经集中 builder 构造客户端,可能失败,向上传播
    // 而非静默退化(与 get_scraper 一致)。
    Ok(match scraper_type {
        "iconify" => Box::new(iconify::IconifyScraper::new()?),
        _ => Box::new(iconify::IconifyScraper::new()?),
    })
}
