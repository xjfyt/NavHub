import { describe, expect, it } from "vitest";
import {
  emptyWallpaperDisplay,
  imageHasPixels,
  pickRandomFromPool,
  reduceWallpaperDisplay,
  shouldPickOnPoolLoad,
  type WallpaperLayer,
} from "./wallpaperDisplay";

const a: WallpaperLayer = { url: "/a.jpg", mediaType: "image" };
const b: WallpaperLayer = {
  url: "/b.jpg",
  posterUrl: "/b-thumb.jpg",
  mediaType: "image",
};

describe("reduceWallpaperDisplay", () => {
  it("首次无旧图时可用缩略图占位，但不在有旧图时盖上新缩略图", () => {
    const first = reduceWallpaperDisplay(emptyWallpaperDisplay(), {
      type: "target",
      show: true,
      url: b.url,
      posterUrl: b.posterUrl,
      mediaType: "image",
    });
    expect(first.placeholder).toBe("/b-thumb.jpg");
    expect(first.shown).toBeNull();

    const withOld = reduceWallpaperDisplay(
      { shown: a, outgoing: null, placeholder: undefined },
      {
        type: "target",
        show: true,
        url: b.url,
        posterUrl: b.posterUrl,
        mediaType: "image",
      },
    );
    expect(withOld.shown).toEqual(a);
    expect(withOld.placeholder).toBeUndefined();
  });

  it("ready 后旧图退到 outgoing，新图成为 shown", () => {
    const next = reduceWallpaperDisplay(
      { shown: a, outgoing: null, placeholder: undefined },
      { type: "ready", layer: b },
    );
    expect(next.shown).toEqual(b);
    expect(next.outgoing).toEqual(a);
    expect(next.placeholder).toBeUndefined();
  });

  it("fail 不清空已显示壁纸", () => {
    const next = reduceWallpaperDisplay(
      { shown: a, outgoing: null, placeholder: undefined },
      { type: "fail" },
    );
    expect(next.shown).toEqual(a);
  });

  it("切到主题色时把当前图放到 outgoing 再淡出，而不是立刻消失", () => {
    const next = reduceWallpaperDisplay(
      { shown: a, outgoing: null, placeholder: undefined },
      { type: "target", show: false },
    );
    expect(next.shown).toBeNull();
    expect(next.outgoing).toEqual(a);
  });

  it("fadeDone 清掉底层旧图", () => {
    const next = reduceWallpaperDisplay(
      { shown: b, outgoing: a, placeholder: undefined },
      { type: "fadeDone" },
    );
    expect(next.outgoing).toBeNull();
    expect(next.shown).toEqual(b);
  });
});

describe("imageHasPixels", () => {
  it("拒绝 0×0（错误当成功）", () => {
    expect(imageHasPixels({ naturalWidth: 0, naturalHeight: 0 })).toBe(false);
    expect(imageHasPixels({ naturalWidth: 12, naturalHeight: 8 })).toBe(true);
  });
});

describe("shuffle pool", () => {
  it("已有当前壁纸时拉池子不再立刻换一张", () => {
    expect(shouldPickOnPoolLoad(true, 10)).toBe(false);
    expect(shouldPickOnPoolLoad(false, 10)).toBe(true);
    expect(shouldPickOnPoolLoad(false, 0)).toBe(false);
  });

  it("pick 避开当前 id", () => {
    const pool = [{ id: "a" }, { id: "b" }];
    expect(pickRandomFromPool(pool, "a")?.id).toBe("b");
    expect(pickRandomFromPool([], "a")).toBeNull();
  });
});
