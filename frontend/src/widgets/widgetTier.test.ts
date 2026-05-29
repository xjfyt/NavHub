import { describe, it, expect } from "vitest";
import { widgetTier, type WidgetTier } from "./widgetTier";

describe("widgetTier", () => {
  it("三档固定尺寸映射:small→sm / medium→md / large→lg", () => {
    expect(widgetTier(6, 3)).toBe("sm"); // small  area 18
    expect(widgetTier(6, 6)).toBe("md"); // medium area 36
    expect(widgetTier(12, 5)).toBe("lg"); // large  area 60
  });

  it("按面积分档:≤24 → sm,≥50 → lg,其余 → md", () => {
    expect(widgetTier(4, 6)).toBe("sm"); // 24 边界(含)→ sm
    expect(widgetTier(5, 5)).toBe("md"); // 25 → md
    expect(widgetTier(7, 7)).toBe("md"); // 49 → md
    expect(widgetTier(10, 5)).toBe("lg"); // 50 边界(含)→ lg
    expect(widgetTier(12, 6)).toBe("lg"); // 72 → lg
  });

  it("边界:面积 24 仍为 sm,25 升到 md", () => {
    expect(widgetTier(8, 3)).toBe("sm"); // 24
    expect(widgetTier(8, 4)).toBe("md"); // 32
  });

  it("边界:面积 49 为 md,50 升到 lg", () => {
    expect(widgetTier(49, 1)).toBe("md");
    expect(widgetTier(50, 1)).toBe("lg");
  });

  it("wRow 为 null/缺省 → 回落到 md(无法判断时不误判为 sm 导致内容被裁)", () => {
    expect(widgetTier(6, null)).toBe("md");
    expect(widgetTier(6, undefined)).toBe("md");
    expect(widgetTier(undefined, undefined)).toBe("md");
  });

  it("非法/非正数尺寸 → md", () => {
    expect(widgetTier(0, 6)).toBe("md");
    expect(widgetTier(6, 0)).toBe("md");
    expect(widgetTier(-3, 6)).toBe("md");
    expect(widgetTier(NaN, 6)).toBe("md");
  });
});

const _t: WidgetTier[] = ["sm", "md", "lg"];
void _t;
