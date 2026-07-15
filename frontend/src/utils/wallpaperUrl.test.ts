import { describe, expect, it } from "vitest";
import {
  isTemporaryWallpaperUrl,
  parseCachedWallpaperPreset,
} from "./wallpaperUrl";

describe("wallpaper URL persistence", () => {
  it("detects S3 presigned URLs case-insensitively", () => {
    expect(
      isTemporaryWallpaperUrl(
        "https://s3.example/a.jpg?X-Amz-Date=20260101T000000Z&X-Amz-Signature=abc",
      ),
    ).toBe(true);
    expect(isTemporaryWallpaperUrl("/uploads/wallpapers/a.jpg")).toBe(false);
  });

  it("drops cached presets containing expiring URLs", () => {
    const raw = JSON.stringify({
      id: "remote-1",
      mediaType: "image",
      assetUrl: "https://s3.example/a.jpg?X-Amz-Signature=old",
      thumbUrl: "/uploads/wallpapers/thumbs/a.jpg",
    });
    expect(parseCachedWallpaperPreset(raw)).toBeNull();
  });

  it("keeps stable cached presets", () => {
    const raw = JSON.stringify({
      id: "remote-1",
      name: "A",
      provider: "remote",
      providerUrl: "",
      sourceUrl: "",
      license: "",
      mediaType: "image",
      assetUrl: "/uploads/wallpapers/a.jpg",
      thumbUrl: "/uploads/wallpapers/thumbs/a.jpg",
    });
    expect(parseCachedWallpaperPreset(raw)?.id).toBe("remote-1");
  });
});
