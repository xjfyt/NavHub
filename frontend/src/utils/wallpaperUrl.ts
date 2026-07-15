import type { WallpaperPreset } from "../constants/wallpapers";

const SIGNATURE_QUERY_KEYS = [
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-date",
  "x-amz-expires",
  "awsaccesskeyid",
];

/** True for S3-style URLs that are unsafe to persist across page loads. */
export function isTemporaryWallpaperUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value, "https://navhub.invalid");
    const keys = new Set(
      Array.from(url.searchParams.keys(), (key) => key.toLowerCase()),
    );
    return SIGNATURE_QUERY_KEYS.some((key) => keys.has(key));
  } catch {
    return false;
  }
}

export function parseCachedWallpaperPreset(
  raw: string | null,
): WallpaperPreset | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WallpaperPreset>;
    if (
      typeof value.id !== "string" ||
      (value.mediaType !== "image" && value.mediaType !== "video") ||
      typeof value.assetUrl !== "string" ||
      typeof value.thumbUrl !== "string"
    ) {
      return null;
    }
    if (
      [value.assetUrl, value.thumbUrl, value.posterUrl].some(
        isTemporaryWallpaperUrl,
      )
    ) {
      return null;
    }
    return value as WallpaperPreset;
  } catch {
    return null;
  }
}
