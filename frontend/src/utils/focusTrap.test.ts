import { describe, it, expect } from "vitest";
import { nextFocusIndex, shouldTrapTab } from "./focusTrap";

describe("nextFocusIndex - 正向 Tab", () => {
  it("从中间元素正向 Tab 走到下一个", () => {
    expect(nextFocusIndex(1, false, 5)).toBe(2);
  });

  it("在最后一个正向 Tab 环绕回第一个", () => {
    expect(nextFocusIndex(4, false, 5)).toBe(0);
  });

  it("焦点不在陷阱内(index = -1)正向 Tab 落到第一个", () => {
    expect(nextFocusIndex(-1, false, 5)).toBe(0);
  });

  it("从第一个正向 Tab 走到第二个", () => {
    expect(nextFocusIndex(0, false, 3)).toBe(1);
  });
});

describe("nextFocusIndex - 反向 Shift+Tab", () => {
  it("从中间元素反向 Tab 走到上一个", () => {
    expect(nextFocusIndex(2, true, 5)).toBe(1);
  });

  it("在第一个反向 Tab 环绕到最后一个", () => {
    expect(nextFocusIndex(0, true, 5)).toBe(4);
  });

  it("焦点不在陷阱内(index = -1)反向 Tab 落到最后一个", () => {
    expect(nextFocusIndex(-1, true, 5)).toBe(4);
  });
});

describe("nextFocusIndex - 边界数量", () => {
  it("没有可聚焦元素返回 -1(正向)", () => {
    expect(nextFocusIndex(0, false, 0)).toBe(-1);
  });

  it("没有可聚焦元素返回 -1(反向)", () => {
    expect(nextFocusIndex(-1, true, 0)).toBe(-1);
  });

  it("count 为负数同样返回 -1", () => {
    expect(nextFocusIndex(0, false, -3)).toBe(-1);
  });

  it("只有一个元素时正向 Tab 永远停在它上面", () => {
    expect(nextFocusIndex(0, false, 1)).toBe(0);
  });

  it("只有一个元素时反向 Tab 也停在它上面", () => {
    expect(nextFocusIndex(0, true, 1)).toBe(0);
  });
});

describe("nextFocusIndex - 完整环绕一周保持封闭", () => {
  it("正向从 0 连续 Tab count 次回到 0", () => {
    const count = 4;
    let idx = 0;
    for (let i = 0; i < count; i++) {
      idx = nextFocusIndex(idx, false, count);
    }
    expect(idx).toBe(0);
  });

  it("反向从 0 连续 Shift+Tab count 次回到 0", () => {
    const count = 4;
    let idx = 0;
    for (let i = 0; i < count; i++) {
      idx = nextFocusIndex(idx, true, count);
    }
    expect(idx).toBe(0);
  });

  it("正向再反向一步可逆", () => {
    const count = 5;
    const fwd = nextFocusIndex(2, false, count); // 3
    expect(nextFocusIndex(fwd, true, count)).toBe(2);
  });
});

describe("shouldTrapTab - 何时需要 JS 接管", () => {
  it("中间位置正向不需要接管(交给浏览器)", () => {
    expect(shouldTrapTab(1, false, 5)).toBe(false);
  });

  it("中间位置反向不需要接管", () => {
    expect(shouldTrapTab(2, true, 5)).toBe(false);
  });

  it("最后一个正向需要接管(环绕)", () => {
    expect(shouldTrapTab(4, false, 5)).toBe(true);
  });

  it("第一个反向需要接管(环绕)", () => {
    expect(shouldTrapTab(0, true, 5)).toBe(true);
  });

  it("第一个正向不接管", () => {
    expect(shouldTrapTab(0, false, 5)).toBe(false);
  });

  it("最后一个反向不接管", () => {
    expect(shouldTrapTab(4, true, 5)).toBe(false);
  });

  it("没有可聚焦元素必须接管以防焦点逃逸", () => {
    expect(shouldTrapTab(-1, false, 0)).toBe(true);
  });

  it("只有一个元素始终接管", () => {
    expect(shouldTrapTab(0, false, 1)).toBe(true);
    expect(shouldTrapTab(0, true, 1)).toBe(true);
  });

  it("焦点不在陷阱内(index = -1)需要接管以落点", () => {
    expect(shouldTrapTab(-1, false, 5)).toBe(true);
    expect(shouldTrapTab(-1, true, 5)).toBe(true);
  });
});
