import type { Tweaks } from "../types";

export interface WallpaperSource {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface WallpaperPreset {
  id: string;
  name: string;
  provider: string;
  providerUrl: string;
  sourceUrl: string;
  license: string;
  author?: string;
  mediaType: "image" | "video";
  assetUrl: string;
  thumbUrl: string;
  posterUrl?: string;
}

const nasaImage = (id: string, size: "thumb" | "medium" | "large" = "large") =>
  `https://images-assets.nasa.gov/image/${id}/${id}~${size}.jpg`;

const commonsFilePage = (fileName: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`;

const commonsFileImage = (fileName: string, width: number) =>
  `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(fileName)}&width=${width}`;

const commonsVideo = (fileName: string) =>
  `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(fileName)}`;

const commonsVideoThumb = (fileName: string, width: number) =>
  `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(fileName)}&width=${width}`;

const commonsVideoPreset = (input: {
  id: string;
  name: string;
  fileName: string;
  license: string;
  author?: string;
}) => ({
  id: input.id,
  name: input.name,
  provider: "Wikimedia Commons",
  providerUrl: "https://commons.wikimedia.org/",
  sourceUrl: commonsFilePage(input.fileName),
  license: input.license,
  author: input.author,
  mediaType: "video" as const,
  assetUrl: commonsVideo(input.fileName),
  thumbUrl: commonsVideoThumb(input.fileName, 640),
  posterUrl: commonsVideoThumb(input.fileName, 1280),
});

export const WALLPAPER_SOURCES: WallpaperSource[] = [
  {
    id: "commons-video",
    name: "Wikimedia Commons",
    description: "开放媒体库，可直接挑选 WebM 动态壁纸与静态图片。",
    url: "https://commons.wikimedia.org/wiki/Category:Videos",
  },
  {
    id: "pixabay-video",
    name: "Pixabay Videos",
    description: "公开可下载视频素材，适合补充 MP4 动态背景。",
    url: "https://pixabay.com/videos/",
  },
  {
    id: "coverr",
    name: "Coverr",
    description: "免署名风格化视频素材，适合做氛围类动态壁纸。",
    url: "https://coverr.co/stock-video-footage",
  },
  {
    id: "mixkit",
    name: "Mixkit",
    description: "免费 stock video 源，适合海景、天空、城市延时素材。",
    url: "https://mixkit.co/free-stock-video/",
  },
  {
    id: "nasa",
    name: "NASA Image Library",
    description: "官方公开图库，适合星空、地球、宇宙题材静态壁纸。",
    url: "https://images.nasa.gov/",
  },
  {
    id: "picsum",
    name: "Lorem Picsum",
    description: "公开图片演示服务，适合快速占位和随机静态背景。",
    url: "https://picsum.photos/",
  },
];

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "lake-mountain-landscape",
    name: "Lake Mountain Landscape",
    provider: "Wikimedia Commons",
    providerUrl: "https://commons.wikimedia.org/",
    sourceUrl: commonsFilePage("Lake Mountain Landscape.jpg"),
    license: "CC0",
    author: "Bonnie Moreland",
    mediaType: "image",
    assetUrl: commonsFileImage("Lake Mountain Landscape.jpg", 1920),
    thumbUrl: commonsFileImage("Lake Mountain Landscape.jpg", 640),
  },
  {
    id: "mountain-lake-vista",
    name: "Mountain Lake Vista",
    provider: "Wikimedia Commons",
    providerUrl: "https://commons.wikimedia.org/",
    sourceUrl: commonsFilePage("Mountain Lake Vista.jpg"),
    license: "CC0",
    mediaType: "image",
    assetUrl: commonsFileImage("Mountain Lake Vista.jpg", 1920),
    thumbUrl: commonsFileImage("Mountain Lake Vista.jpg", 640),
  },
  {
    id: "nature-lake",
    name: "Landscape Mountains Nature Lake",
    provider: "Wikimedia Commons",
    providerUrl: "https://commons.wikimedia.org/",
    sourceUrl: commonsFilePage(
      "Landscape-mountains-nature-lake (24326735085).jpg",
    ),
    license: "CC0",
    author: "pixellaphoto",
    mediaType: "image",
    assetUrl: commonsFileImage(
      "Landscape-mountains-nature-lake (24326735085).jpg",
      1920,
    ),
    thumbUrl: commonsFileImage(
      "Landscape-mountains-nature-lake (24326735085).jpg",
      640,
    ),
  },
  {
    id: "gangapurna-lake",
    name: "Morning Reflection at Gangapurna Lake",
    provider: "Wikimedia Commons",
    providerUrl: "https://commons.wikimedia.org/",
    sourceUrl: commonsFilePage("Morning Reflection at Gangapurna Lake.jpg"),
    license: "CC0",
    mediaType: "image",
    assetUrl: commonsFileImage(
      "Morning Reflection at Gangapurna Lake.jpg",
      1920,
    ),
    thumbUrl: commonsFileImage(
      "Morning Reflection at Gangapurna Lake.jpg",
      640,
    ),
  },
  {
    id: "aurora-blankets-earth",
    name: "Aurora Borealis Blankets the Earth",
    provider: "NASA Image Library",
    providerUrl: "https://images.nasa.gov/",
    sourceUrl: "https://images.nasa.gov/details/iss072e159172",
    license: "Public domain",
    mediaType: "image",
    assetUrl: nasaImage("iss072e159172"),
    thumbUrl: nasaImage("iss072e159172", "medium"),
  },
  {
    id: "earth-limb-aurora",
    name: "Earth Limb with Aurora",
    provider: "NASA Image Library",
    providerUrl: "https://images.nasa.gov/",
    sourceUrl: "https://images.nasa.gov/details/iss058e005282",
    license: "Public domain",
    mediaType: "image",
    assetUrl: nasaImage("iss058e005282"),
    thumbUrl: nasaImage("iss058e005282", "medium"),
  },
  {
    id: "aurora-australis",
    name: "Aurora Australis",
    provider: "NASA Image Library",
    providerUrl: "https://images.nasa.gov/",
    sourceUrl: "https://images.nasa.gov/details/s45-31-012",
    license: "Public domain",
    mediaType: "image",
    assetUrl: nasaImage("s45-31-012"),
    thumbUrl: nasaImage("s45-31-012", "medium"),
  },
  {
    id: "cygnus-loop-nebula",
    name: "Cygnus Loop Nebula",
    provider: "NASA Image Library",
    providerUrl: "https://images.nasa.gov/",
    sourceUrl: "https://images.nasa.gov/details/PIA15415",
    license: "Public domain",
    mediaType: "image",
    assetUrl: nasaImage("PIA15415"),
    thumbUrl: nasaImage("PIA15415", "medium"),
  },
  {
    id: "lambda-centauri-nebula",
    name: "Lambda Centauri Nebula",
    provider: "NASA Image Library",
    providerUrl: "https://images.nasa.gov/",
    sourceUrl: "https://images.nasa.gov/details/PIA13451",
    license: "Public domain",
    mediaType: "image",
    assetUrl: nasaImage("PIA13451"),
    thumbUrl: nasaImage("PIA13451", "medium"),
  },
  {
    id: "alpine-ridge",
    name: "Alpine Ridge",
    provider: "Lorem Picsum",
    providerUrl: "https://picsum.photos/",
    sourceUrl: "https://picsum.photos/id/1015/info",
    license: "Public demo source",
    author: "Alexey Topolyanskiy",
    mediaType: "image",
    assetUrl: "https://picsum.photos/id/1015/1920/1080.webp",
    thumbUrl: "https://picsum.photos/id/1015/640/360.webp",
  },
  {
    id: "fjord-road",
    name: "Fjord Road",
    provider: "Lorem Picsum",
    providerUrl: "https://picsum.photos/",
    sourceUrl: "https://picsum.photos/id/1018/info",
    license: "Public demo source",
    author: "Andrew Ridley",
    mediaType: "image",
    assetUrl: "https://picsum.photos/id/1018/1920/1080.webp",
    thumbUrl: "https://picsum.photos/id/1018/640/360.webp",
  },
  {
    id: "sea-cliff",
    name: "Sea Cliff",
    provider: "Lorem Picsum",
    providerUrl: "https://picsum.photos/",
    sourceUrl: "https://picsum.photos/id/1016/info",
    license: "Public demo source",
    author: "Philippe Wuyts",
    mediaType: "image",
    assetUrl: "https://picsum.photos/id/1016/1920/1080.webp",
    thumbUrl: "https://picsum.photos/id/1016/640/360.webp",
  },
  commonsVideoPreset({
    id: "aurora-borealis-timelapse",
    name: "Aurora Borealis Timelapse",
    fileName: "Aurora_borealis_timelapse.webm",
    license: "CC BY 3.0",
    author: "Eatcha",
  }),
  commonsVideoPreset({
    id: "clouds-time-lapse",
    name: "Clouds Time Lapse",
    fileName: "Clouds_(time_lapse).webm",
    license: "CC BY 3.0",
  }),
  commonsVideoPreset({
    id: "sunrise-timelapse",
    name: "Sunrise Timelapse",
    fileName: "Sunrise_timelapse.webm",
    license: "CC BY-SA 2.0",
    author: "James West",
  }),
  commonsVideoPreset({
    id: "all4sounds-clouds",
    name: "All4sounds Cloud Time Lapse",
    fileName: "All4sounds_-_Cloud_Time_lapse.webm",
    license: "CC0",
    author: "All4sounds",
  }),
  commonsVideoPreset({
    id: "flight-over-clouds",
    name: "Flight over Clouds",
    fileName: "Flight_over_clouds.webm",
    license: "CC0",
  }),
];

export const DEFAULT_SHUFFLE_INTERVAL_SEC = 60;
export const MIN_SHUFFLE_INTERVAL_SEC = 2;
/** 30 days */
export const MAX_SHUFFLE_INTERVAL_SEC = 30 * 24 * 60 * 60;

export function normalizeShuffleInterval(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SHUFFLE_INTERVAL_SEC;
  return Math.max(
    MIN_SHUFFLE_INTERVAL_SEC,
    Math.min(MAX_SHUFFLE_INTERVAL_SEC, Math.round(n)),
  );
}

export type ShuffleIntervalUnit = "s" | "m" | "h" | "d";

const UNIT_SECONDS: Record<ShuffleIntervalUnit, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** 把秒拆成最大整除的（数值，单位）展示形式 */
export function decomposeShuffleInterval(totalSec: number): {
  value: number;
  unit: ShuffleIntervalUnit;
} {
  const sec = normalizeShuffleInterval(totalSec);
  const units: ShuffleIntervalUnit[] = ["d", "h", "m", "s"];
  for (const u of units) {
    const factor = UNIT_SECONDS[u];
    if (sec >= factor && sec % factor === 0) {
      return { value: sec / factor, unit: u };
    }
  }
  return { value: sec, unit: "s" };
}

export function composeShuffleInterval(
  value: number,
  unit: ShuffleIntervalUnit,
): number {
  const factor = UNIT_SECONDS[unit];
  const total = Math.max(1, Math.round(value)) * factor;
  return normalizeShuffleInterval(total);
}

export function formatShuffleInterval(totalSec: number): string {
  const { value, unit } = decomposeShuffleInterval(totalSec);
  const label: Record<ShuffleIntervalUnit, string> = {
    s: "秒",
    m: "分钟",
    h: "小时",
    d: "天",
  };
  return `${value} ${label[unit]}`;
}

export function findWallpaperPreset(id?: string | null) {
  if (!id) return undefined;
  return WALLPAPER_PRESETS.find((item) => item.id === id);
}

export function buildWallpaperTweaks(preset: WallpaperPreset): Partial<Tweaks> {
  return {
    backgroundMode: "wallpaper",
    wallpaperId: preset.id,
    wallpaperName: preset.name,
    wallpaperUrl: preset.assetUrl,
    wallpaperThumb: preset.thumbUrl,
    wallpaperProvider: preset.provider,
    wallpaperProviderUrl: preset.providerUrl,
    wallpaperSourceUrl: preset.sourceUrl,
    wallpaperLicense: preset.license,
    wallpaperAuthor: preset.author,
    wallpaperMediaType: preset.mediaType,
    wallpaperPosterUrl: preset.posterUrl || preset.thumbUrl,
  };
}

export function randomWallpaperPreset(
  excludeId?: string | null,
): WallpaperPreset {
  const pool = WALLPAPER_PRESETS.filter((item) => item.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)] || WALLPAPER_PRESETS[0];
}

export function inferWallpaperMediaType(url: string): "image" | "video" {
  const pathname = new URL(url).pathname.toLowerCase();
  if (/\.(mp4|webm|ogv|mov|m4v)$/i.test(pathname)) return "video";
  return "image";
}
