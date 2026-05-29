import { describe, it, expect } from "vitest";
import {
  shouldUseContentVisibility,
  NAV_CONTENT_VISIBILITY_THRESHOLD,
} from "./navVirtualization";

describe("shouldUseContentVisibility", () => {
  it("小分类(项数低于阈值)不启用 content-visibility,避免给小网格平添开销", () => {
    expect(shouldUseContentVisibility(0)).toBe(false);
    expect(shouldUseContentVisibility(1)).toBe(false);
    expect(
      shouldUseContentVisibility(NAV_CONTENT_VISIBILITY_THRESHOLD - 1),
    ).toBe(false);
  });

  it("项数达到阈值即视为大分类,启用 content-visibility 让浏览器跳过离屏单元格渲染", () => {
    expect(shouldUseContentVisibility(NAV_CONTENT_VISIBILITY_THRESHOLD)).toBe(
      true,
    );
    expect(
      shouldUseContentVisibility(NAV_CONTENT_VISIBILITY_THRESHOLD + 1),
    ).toBe(true);
    expect(shouldUseContentVisibility(1000)).toBe(true);
  });

  it("阈值设定为 150(PERF-7 所述「大分类」起点)", () => {
    expect(NAV_CONTENT_VISIBILITY_THRESHOLD).toBe(150);
  });

  it("对非法/负数计数做兜底,不抛错且按未达阈值处理", () => {
    expect(shouldUseContentVisibility(-5)).toBe(false);
    expect(shouldUseContentVisibility(Number.NaN)).toBe(false);
  });
});
