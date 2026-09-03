import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeShuffleInterval,
  type WallpaperPreset,
} from "../constants/wallpapers";
import { Tweaks, RemoteWallpaperItem } from "../types";
import { api } from "../api";
import { parseCachedWallpaperPreset } from "../utils/wallpaperUrl";
import {
  pickRandomFromPool,
  shouldPickOnPoolLoad,
} from "../utils/wallpaperDisplay";
import { isAbortError, loadWallpaperAsset } from "../utils/wallpaperLoad";

const POOL_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

/**
 * 随机壁纸轮播。
 * 从 /api/wallpapers 抽池；下一张解码完成前不替换当前画面。
 * 池为空时保持已显示的壁纸，不宣称仍在轮换。
 */
export function useWallpaperShuffle(tweaks: Tweaks) {
  const [poolEmpty, setPoolEmpty] = useState(false);
  const [shufflePreset, setShufflePreset] = useState<WallpaperPreset | null>(
    () => {
      try {
        const cached = parseCachedWallpaperPreset(
          window.localStorage.getItem("navhub_last_wallpaper"),
        );
        if (!cached) window.localStorage.removeItem("navhub_last_wallpaper");
        return cached;
      } catch {
        return null;
      }
    },
  );

  useEffect(() => {
    if (shufflePreset) {
      try {
        window.localStorage.setItem(
          "navhub_last_wallpaper",
          JSON.stringify(shufflePreset),
        );
      } catch {
        /* quota */
      }
    }
  }, [shufflePreset]);
  const poolRef = useRef<WallpaperPreset[]>([]);
  const lastIdRef = useRef<string | null>(shufflePreset?.id ?? null);
  const commitGenRef = useRef(0);

  const shuffleEnabled =
    tweaks.wallpaperShuffle !== false && tweaks.backgroundMode !== "theme";
  const shuffleIntervalSec = normalizeShuffleInterval(
    tweaks.wallpaperShuffleInterval,
  );

  const mediaType =
    (tweaks.wallpaperShuffleMediaType as "" | "image" | "video") || "";
  const sourceId = tweaks.wallpaperShuffleSource || "";

  const commitWhenReady = useCallback(async (next: WallpaperPreset | null) => {
    if (!next) return false;
    const gen = ++commitGenRef.current;
    try {
      await loadWallpaperAsset(next.assetUrl, next.mediaType);
      if (gen !== commitGenRef.current) return false;
      lastIdRef.current = next.id;
      setShufflePreset(next);
      return true;
    } catch (e) {
      if (isAbortError(e)) return false;
      return false;
    }
  }, []);

  useEffect(() => {
    if (!shuffleEnabled) return;
    let alive = true;
    let retryTimer: number | undefined;
    let retryIndex = 0;

    const loadPool = () => {
      api
        .wallpapers({
          limit: 100,
          mediaType: mediaType || undefined,
          sourceId: sourceId || undefined,
        })
        .then((resp) => {
          if (!alive) return;
          const pool = resp.items.map(remoteToPreset);
          poolRef.current = pool;
          setPoolEmpty(pool.length === 0);
          if (shouldPickOnPoolLoad(!!lastIdRef.current, pool.length)) {
            void commitWhenReady(pickRandomFromPool(pool, lastIdRef.current));
          }
        })
        .catch(() => {
          if (!alive) return;
          poolRef.current = [];
          setPoolEmpty(true);
          const delay = POOL_RETRY_DELAYS_MS[retryIndex++];
          if (delay !== undefined)
            retryTimer = window.setTimeout(loadPool, delay);
        });
    };

    loadPool();
    return () => {
      alive = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [shuffleEnabled, mediaType, sourceId, commitWhenReady]);

  useEffect(() => {
    if (!shuffleEnabled) return;
    let alive = true;
    let inFlight = false;
    const tick = () => {
      if (!alive || inFlight) return;
      const next = pickRandomFromPool(poolRef.current, lastIdRef.current);
      if (!next) return;
      inFlight = true;
      void commitWhenReady(next).finally(() => {
        inFlight = false;
      });
    };
    const timer = window.setInterval(tick, shuffleIntervalSec * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [shuffleEnabled, shuffleIntervalSec, commitWhenReady]);

  const shuffleActive = shuffleEnabled && !!shufflePreset;

  const nextPreset = useCallback(async () => {
    const next = pickRandomFromPool(poolRef.current, lastIdRef.current);
    if (!next) return false;
    return commitWhenReady(next);
  }, [commitWhenReady]);

  return {
    shufflePreset,
    shuffleEnabled,
    shuffleActive,
    nextPreset,
    poolEmpty,
  };
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
