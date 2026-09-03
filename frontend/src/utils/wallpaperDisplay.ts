/** 壁纸层状态：目标 URL 变化时不丢掉已显示画面，解码完成后再交叉淡入。 */

export interface WallpaperLayer {
  url: string;
  posterUrl?: string;
  mediaType: "image" | "video";
}

export interface WallpaperDisplayState {
  shown: WallpaperLayer | null;
  outgoing: WallpaperLayer | null;
  /** 尚无 shown 时用的低清占位（首次进入），已有画面时不用新图缩略图盖住旧图。 */
  placeholder: string | undefined;
}

export const emptyWallpaperDisplay = (): WallpaperDisplayState => ({
  shown: null,
  outgoing: null,
  placeholder: undefined,
});

export type WallpaperDisplayEvent =
  | {
      type: "target";
      show: boolean;
      url?: string;
      posterUrl?: string;
      mediaType?: "image" | "video";
    }
  | { type: "ready"; layer: WallpaperLayer }
  | { type: "fail" }
  | { type: "fadeDone" };

export function reduceWallpaperDisplay(
  state: WallpaperDisplayState,
  event: WallpaperDisplayEvent,
): WallpaperDisplayState {
  switch (event.type) {
    case "target": {
      if (!event.show || !event.url) {
        if (!state.shown) {
          return { shown: null, outgoing: null, placeholder: undefined };
        }
        return {
          shown: null,
          outgoing: state.shown,
          placeholder: undefined,
        };
      }
      if (state.shown?.url === event.url) {
        return { ...state, placeholder: undefined };
      }
      const placeholder =
        state.shown || !event.posterUrl || event.posterUrl === event.url
          ? state.placeholder
          : event.posterUrl;
      return { ...state, placeholder };
    }
    case "ready": {
      if (state.shown?.url === event.layer.url) {
        return { ...state, placeholder: undefined, outgoing: state.outgoing };
      }
      return {
        shown: event.layer,
        outgoing: state.shown,
        placeholder: undefined,
      };
    }
    case "fail":
      // 失败不把已显示的画面清成纯色。
      return state;
    case "fadeDone":
      return { ...state, outgoing: null };
    default:
      return state;
  }
}

export function imageHasPixels(img: {
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return img.naturalWidth > 0 && img.naturalHeight > 0;
}

export function shouldPickOnPoolLoad(
  hasCurrent: boolean,
  poolLength: number,
): boolean {
  return !hasCurrent && poolLength > 0;
}

export function pickRandomFromPool<T extends { id: string }>(
  pool: T[],
  excludeId: string | null,
): T | null {
  if (!pool.length) return null;
  const filtered =
    pool.length > 1 ? pool.filter((p) => p.id !== excludeId) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)] || pool[0];
}
