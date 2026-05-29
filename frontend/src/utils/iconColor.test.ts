import { describe, it, expect } from "vitest";
import { safeIconColor } from "./iconColor";
import { DEFAULT_ICON_COLORS } from "../constants/design";

const LEN = DEFAULT_ICON_COLORS.length;

describe("safeIconColor", () => {
  it("范围内下标原样返回对应颜色", () => {
    expect(safeIconColor(0)).toBe(DEFAULT_ICON_COLORS[0]);
    expect(safeIconColor(3)).toBe(DEFAULT_ICON_COLORS[3]);
    expect(safeIconColor(LEN - 1)).toBe(DEFAULT_ICON_COLORS[LEN - 1]);
  });

  it("超界下标按模回绕", () => {
    expect(safeIconColor(LEN)).toBe(DEFAULT_ICON_COLORS[0]);
    expect(safeIconColor(LEN + 2)).toBe(DEFAULT_ICON_COLORS[2]);
  });

  it("负数下标也映射进合法区间(不再返回 undefined)", () => {
    expect(safeIconColor(-1)).toBe(DEFAULT_ICON_COLORS[LEN - 1]);
    expect(safeIconColor(-LEN)).toBe(DEFAULT_ICON_COLORS[0]);
  });

  it("NaN / null / undefined 回退到第 0 个颜色", () => {
    expect(safeIconColor(NaN)).toBe(DEFAULT_ICON_COLORS[0]);
    expect(safeIconColor(null)).toBe(DEFAULT_ICON_COLORS[0]);
    expect(safeIconColor(undefined)).toBe(DEFAULT_ICON_COLORS[0]);
  });

  it("小数下标先取整再回绕", () => {
    expect(safeIconColor(2.9)).toBe(DEFAULT_ICON_COLORS[2]);
  });

  it("永远返回已定义的颜色对象", () => {
    for (let i = -30; i < 30; i++) {
      expect(safeIconColor(i)).toBeDefined();
      expect(safeIconColor(i).bg).toBeTypeOf("string");
    }
  });
});
