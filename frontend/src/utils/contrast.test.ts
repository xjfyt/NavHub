import { describe, it, expect } from "vitest";
import {
  parseHex,
  composite,
  contrastRatio,
  relativeLuminance,
  rgbToHex,
} from "./contrast";

describe("contrastRatio - 已知配对", () => {
  it("黑 / 白 = 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("同色 = 1:1", () => {
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("顺序无关(对称)", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(
      contrastRatio("#fff", "#000"),
      5,
    );
  });

  it("支持三位简写 hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
  });

  it("非法 hex 抛错", () => {
    expect(() => contrastRatio("nope", "#fff")).toThrow();
  });
});

describe("parseHex / relativeLuminance / rgbToHex", () => {
  it("解析 #rrggbb", () => {
    expect(parseHex("#1e1e26")).toEqual({ r: 30, g: 30, b: 38 });
  });
  it("白比黑亮度高", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(
      relativeLuminance({ r: 0, g: 0, b: 0 }),
    );
  });
  it("rgbToHex 往返", () => {
    expect(rgbToHex(parseHex("#abcdef"))).toBe("#abcdef");
  });
});

describe("composite - alpha 合成", () => {
  it("alpha=1 时即前景色", () => {
    expect(composite({ r: 10, g: 20, b: 30, a: 1 }, { r: 0, g: 0, b: 0 })).toEqual(
      { r: 10, g: 20, b: 30 },
    );
  });
  it("alpha=0 时即背景色", () => {
    expect(
      composite({ r: 10, g: 20, b: 30, a: 0 }, { r: 200, g: 200, b: 200 }),
    ).toEqual({ r: 200, g: 200, b: 200 });
  });
  it("50% 白叠加在黑上得到灰", () => {
    expect(
      composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0 }),
    ).toEqual({ r: 128, g: 128, b: 128 });
  });
});

// A11Y-8:对实际 token 做 AA 审计(4.5:1 正文阈值)。
// 把半透明 token 合成到具代表性的不透明面板/模态背景上再算对比度。
describe("token AA 审计 - 静音文本", () => {
  // 暗色模态面板:rgba(30,30,38,0.72) 叠在偏暗壁纸(~#20202a)上
  const darkSurface = composite({ r: 30, g: 30, b: 38, a: 0.72 }, { r: 0x20, g: 0x20, b: 0x2a });
  // 亮色模态面板:rgba(255,255,255,0.85) 叠在偏亮壁纸(~#e8e6e2)上
  const lightSurface = composite({ r: 255, g: 255, b: 255, a: 0.85 }, { r: 0xe8, g: 0xe6, b: 0xe2 });

  it("暗色 --text-mute rgba(255,255,255,0.50) 满足 AA(4.5:1)", () => {
    const mute = composite({ r: 255, g: 255, b: 255, a: 0.5 }, darkSurface);
    const ratio = contrastRatio(rgbToHex(mute), rgbToHex(darkSurface));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("亮色 --text-mute 调整后 rgba(28,26,23,0.62) 满足 AA(4.5:1)", () => {
    const mute = composite({ r: 28, g: 26, b: 23, a: 0.62 }, lightSurface);
    const ratio = contrastRatio(rgbToHex(mute), rgbToHex(lightSurface));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("亮色 --text-mute 调整前 rgba(28,26,23,0.54) 不满足 AA(回归保护)", () => {
    const mute = composite({ r: 28, g: 26, b: 23, a: 0.54 }, lightSurface);
    const ratio = contrastRatio(rgbToHex(mute), rgbToHex(lightSurface));
    expect(ratio).toBeLessThan(4.5);
  });
});
