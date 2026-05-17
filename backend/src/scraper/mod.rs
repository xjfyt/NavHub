pub mod bing;
pub mod desktophut;
pub mod nasa;
pub mod pexels;
pub mod pixabay;
pub mod iconify;
pub mod unsplash;
pub mod wallhaven;
pub mod wikimedia;

use anyhow::Result;

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
        .any(|word| tokens.iter().any(|token| word == *token))
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

pub fn get_scraper(scraper_type: &str) -> Box<dyn Scraper> {
    match scraper_type {
        "builtin" => Box::new(BuiltinScraper),
        "bing" => Box::new(bing::BingScraper::new()),
        "desktophut" => Box::new(desktophut::DesktopHutScraper::new()),
        "wikimedia" => Box::new(wikimedia::WikimediaScraper::new()),
        "nasa" => Box::new(nasa::NasaScraper::new()),
        "unsplash" => Box::new(unsplash::UnsplashScraper::new()),
        "wallhaven" => Box::new(wallhaven::WallhavenScraper::new()),
        "pexels" => Box::new(pexels::PexelsScraper::new()),
        "pixabay" => Box::new(pixabay::PixabayScraper::new()),
        _ => Box::new(desktophut::DesktopHutScraper::new()),
    }
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

pub fn get_icon_scraper(scraper_type: &str) -> Box<dyn IconScraper> {
    match scraper_type {
        "iconify" => Box::new(iconify::IconifyScraper::new()),
        _ => Box::new(iconify::IconifyScraper::new()),
    }
}
