import type { RemoteWallpaperItem } from "../../types";

/**
 * 决定壁纸预览要用的图片地址（纯函数，便于单测）。
 * - 缩略图未失败且存在时优先用缩略图；
 * - 否则若是静态图片则用原图；
 * - 视频且缩略图失败时返回 null（由调用方走视频/占位分支）。
 */
export const wallpaperImagePreviewUrl = (
  w: RemoteWallpaperItem,
  thumbFailed: boolean,
): string | null => {
  if (!thumbFailed && w.thumbnailUrl) return w.thumbnailUrl;
  if (w.mediaType === "image") return w.url;
  return null;
};
