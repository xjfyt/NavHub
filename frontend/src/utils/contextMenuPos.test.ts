import { describe, expect, it } from "vitest";
import { contextMenuPosition } from "./contextMenuPos";

describe("contextMenuPosition", () => {
  it("底部附近向上翻", () => {
    const p = contextMenuPosition(100, 700, 6, 800, 720);
    expect(p.top).toBeLessThan(700);
  });
  it("右侧贴边", () => {
    const p = contextMenuPosition(790, 40, 3, 800, 720);
    expect(p.left).toBeLessThan(790);
  });
});
