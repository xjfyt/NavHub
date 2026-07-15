import { useEffect, useState } from "react";
import { api } from "../api";
import type { RemoteWallpaperItem, Tweaks } from "../types";
import { isTemporaryWallpaperUrl } from "../utils/wallpaperUrl";

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve preferences written by old versions that persisted an expiring URL. */
export function usePinnedWallpaper(tweaks: Tweaks) {
  const wallpaperId =
    typeof tweaks.wallpaperId === "string" &&
    tweaks.wallpaperId.startsWith("remote-")
      ? tweaks.wallpaperId.slice("remote-".length)
      : null;
  const configuredUrl = tweaks.wallpaperUrl;
  const posterUrl = tweaks.wallpaperPosterUrl;
  const needsResolution =
    tweaks.backgroundMode === "wallpaper" &&
    tweaks.wallpaperShuffle === false &&
    !!wallpaperId &&
    UUID_RE.test(wallpaperId) &&
    (!configuredUrl ||
      isTemporaryWallpaperUrl(configuredUrl) ||
      isTemporaryWallpaperUrl(posterUrl));

  const [resolved, setResolved] = useState<RemoteWallpaperItem | null>(null);

  useEffect(() => {
    setResolved(null);
    if (!needsResolution || !wallpaperId) return;

    let alive = true;
    let retryTimer: number | undefined;
    let retryIndex = 0;

    const resolve = () => {
      api
        .wallpaper(wallpaperId)
        .then((item) => {
          if (alive) setResolved(item);
        })
        .catch(() => {
          if (!alive) return;
          const delay = RETRY_DELAYS_MS[retryIndex++];
          if (delay !== undefined)
            retryTimer = window.setTimeout(resolve, delay);
        });
    };

    resolve();
    return () => {
      alive = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [needsResolution, wallpaperId]);

  return resolved;
}
