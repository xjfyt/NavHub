import { describe, it, expect } from "vitest";
import { shouldShowDragHint } from "./dragHint";

describe("shouldShowDragHint", () => {
  it("可编辑 + 有内容 + 未关闭 → 展示", () => {
    expect(
      shouldShowDragHint({ editable: true, hasContent: true, dismissed: false }),
    ).toBe(true);
  });

  it("不可编辑(访客 / 只读分类)→ 不展示", () => {
    expect(
      shouldShowDragHint({ editable: false, hasContent: true, dismissed: false }),
    ).toBe(false);
  });

  it("空分类(没东西可拖)→ 不展示", () => {
    expect(
      shouldShowDragHint({ editable: true, hasContent: false, dismissed: false }),
    ).toBe(false);
  });

  it("用户已手动关闭 → 不再展示", () => {
    expect(
      shouldShowDragHint({ editable: true, hasContent: true, dismissed: true }),
    ).toBe(false);
  });

  it("多个条件同时不满足 → 不展示", () => {
    expect(
      shouldShowDragHint({ editable: false, hasContent: false, dismissed: true }),
    ).toBe(false);
  });
});
