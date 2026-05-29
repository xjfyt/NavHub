import { describe, it, expect } from "vitest";
import { wallpaperImagePreviewUrl } from "./wallpaperPreview";
import type { RemoteWallpaperItem } from "../../types";

const base = (over: Partial<RemoteWallpaperItem>): RemoteWallpaperItem => ({
  id: "1",
  sourceId: "src",
  title: "t",
  url: "https://x/full.jpg",
  thumbnailUrl: "https://x/thumb.jpg",
  pageUrl: null,
  mediaType: "image",
  author: null,
  ...over,
});

describe("wallpaperImagePreviewUrl", () => {
  it("缩略图未失败且存在时优先返回缩略图", () => {
    const w = base({ thumbnailUrl: "https://x/thumb.jpg" });
    expect(wallpaperImagePreviewUrl(w, false)).toBe("https://x/thumb.jpg");
  });

  it("缩略图失败但是静态图片时回退到原图", () => {
    const w = base({
      mediaType: "image",
      url: "https://x/full.jpg",
      thumbnailUrl: "https://x/thumb.jpg",
    });
    expect(wallpaperImagePreviewUrl(w, true)).toBe("https://x/full.jpg");
  });

  it("无缩略图但是静态图片时返回原图", () => {
    const w = base({ mediaType: "image", thumbnailUrl: null });
    expect(wallpaperImagePreviewUrl(w, false)).toBe(w.url);
  });

  it("视频且缩略图失败时返回 null", () => {
    const w = base({ mediaType: "video", thumbnailUrl: "https://x/thumb.jpg" });
    expect(wallpaperImagePreviewUrl(w, true)).toBeNull();
  });

  it("视频但缩略图未失败时仍返回缩略图", () => {
    const w = base({ mediaType: "video", thumbnailUrl: "https://x/thumb.jpg" });
    expect(wallpaperImagePreviewUrl(w, false)).toBe("https://x/thumb.jpg");
  });

  it("视频且无缩略图时返回 null", () => {
    const w = base({ mediaType: "video", thumbnailUrl: null });
    expect(wallpaperImagePreviewUrl(w, false)).toBeNull();
  });
});
