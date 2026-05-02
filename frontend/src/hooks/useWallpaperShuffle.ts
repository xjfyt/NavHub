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
  const [shufflePreset, setShufflePreset] = useState<WallpaperPreset | null>(null);
  const poolRef = useRef<WallpaperPreset[]>([]);
  const lastIdRef = useRef<string | null>(null);

  const shuffleEnabled =
    tweaks.wallpaperShuffle !== false && tweaks.backgroundMode !== "theme";
  const shuffleIntervalSec = normalizeShuffleInterval(tweaks.wallpaperShuffleInterval);

  // 拉取一次远程壁纸池（最多 100 张），缓存到 ref。
  useEffect(() => {
    if (!shuffleEnabled) return;
    let alive = true;
    api.wallpapers({ limit: 100 })
      .then((resp) => {
        if (!alive) return;
        poolRef.current = resp.items.map(remoteToPreset);
      })
      .catch(() => {
        if (!alive) return;
        poolRef.current = [];
      });
    return () => { alive = false; };
  }, [shuffleEnabled]);

  useEffect(() => {
    if (!shuffleEnabled) {
      setShufflePreset(null);
      lastIdRef.current = null;
      return;
    }
    const pick = () => {
      const next = pickRandom(poolRef.current, lastIdRef.current);
      lastIdRef.current = next.id;
      setShufflePreset(next);
    };
    pick();
    const timer = window.setInterval(pick, shuffleIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [shuffleEnabled, shuffleIntervalSec]);

  const shuffleActive = shuffleEnabled && !!shufflePreset;

  const nextPreset = () => {
    const next = pickRandom(poolRef.current, lastIdRef.current);
    lastIdRef.current = next.id;
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
