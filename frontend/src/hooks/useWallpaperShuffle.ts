import { useEffect, useRef, useState } from "react";
import {
  normalizeShuffleInterval,
  randomWallpaperPreset,
  type WallpaperPreset,
} from "../constants/wallpapers";
import { Tweaks, RemoteWallpaperItem } from "../types";
import { api } from "../api";

/**
 * 随机壁纸轮播。
 * 优先从缓存的远程壁纸库（/api/wallpapers）中抽取，
 * 若缓存为空再回退到本地内置 WALLPAPER_PRESETS。
 */
export function useWallpaperShuffle(tweaks: Tweaks) {
  const [shufflePreset, setShufflePreset] = useState<WallpaperPreset | null>(() => {
    try {
      const cached = window.localStorage.getItem("navhub_last_wallpaper");
      if (cached) return JSON.parse(cached);
    } catch {}
    return randomWallpaperPreset(null);
  });

  useEffect(() => {
    if (shufflePreset) {
      try {
        window.localStorage.setItem("navhub_last_wallpaper", JSON.stringify(shufflePreset));
      } catch {}
    }
  }, [shufflePreset]);
  const poolRef = useRef<WallpaperPreset[]>([]);
  const lastIdRef = useRef<string | null>(shufflePreset?.id ?? null);

  const shuffleEnabled =
    tweaks.wallpaperShuffle !== false && tweaks.backgroundMode !== "theme";
  const shuffleIntervalSec = normalizeShuffleInterval(tweaks.wallpaperShuffleInterval);

  const mediaType = (tweaks.wallpaperShuffleMediaType as "" | "image" | "video") || "";
  const sourceId = tweaks.wallpaperShuffleSource || "";

  // 拉取一次远程壁纸池（最多 100 张），缓存到 ref。
  useEffect(() => {
    if (!shuffleEnabled) return;
    let alive = true;
    api.wallpapers({ 
      limit: 100,
      mediaType: mediaType || undefined,
      sourceId: sourceId || undefined,
    })
      .then((resp) => {
        if (!alive) return;
        const pool = resp.items.map(remoteToPreset);
        poolRef.current = pool;
        if (pool.length > 0) {
          const next = pickRandom(pool, lastIdRef.current);
          lastIdRef.current = next.id;
          warmWallpaper(next);
          setShufflePreset(next);
        }
      })
      .catch(() => {
        if (!alive) return;
        poolRef.current = [];
      });
    return () => { alive = false; };
  }, [shuffleEnabled, mediaType, sourceId]);

  useEffect(() => {
    if (!shuffleEnabled) {
      return;
    }
    const pick = () => {
      const next = pickRandom(poolRef.current, lastIdRef.current);
      lastIdRef.current = next.id;
      warmWallpaper(next);
      setShufflePreset(next);
    };

    if (!shufflePreset) {
      pick();
    } else {
      lastIdRef.current = shufflePreset.id;
      warmWallpaper(shufflePreset);
    }

    const timer = window.setInterval(pick, shuffleIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [shuffleEnabled, shuffleIntervalSec]);

  const shuffleActive = shuffleEnabled && !!shufflePreset;

  const nextPreset = () => {
    const next = pickRandom(poolRef.current, lastIdRef.current);
    lastIdRef.current = next.id;
    warmWallpaper(next);
    setShufflePreset(next);
  };

  return { shufflePreset, shuffleEnabled, shuffleActive, nextPreset };
}

function pickRandom(pool: WallpaperPreset[], excludeId: string | null): WallpaperPreset {
  if (!pool.length) return randomWallpaperPreset(excludeId);
  const filtered = pool.length > 1 ? pool.filter((p) => p.id !== excludeId) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)] || pool[0];
}

function remoteToPreset(w: RemoteWallpaperItem): WallpaperPreset {
  return {
    id: `remote-${w.id}`,
    name: w.title ?? "在线壁纸",
    provider: w.sourceName ?? "远程壁纸库",
    providerUrl: w.pageUrl ?? "",
    sourceUrl: w.pageUrl ?? w.url,
    license: "",
    author: w.author ?? undefined,
    mediaType: w.mediaType,
    assetUrl: w.url,
    thumbUrl: w.thumbnailUrl ?? w.url,
    posterUrl: w.thumbnailUrl ?? undefined,
  };
}

function warmWallpaper(preset: WallpaperPreset) {
  if (typeof window === "undefined") return;
  const urls = [preset.posterUrl, preset.thumbUrl].filter(Boolean) as string[];
  for (const url of urls) {
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
  if (preset.mediaType === "image") {
    const img = new window.Image();
    img.decoding = "async";
    img.src = preset.assetUrl;
    if (img.decode) void img.decode().catch(() => undefined);
  }
}
