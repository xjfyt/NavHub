import { describe, it, expect } from "vitest";
import { pickEmptyState } from "./emptyState";

describe("pickEmptyState", () => {
  it("没有任何分类时返回 no-groups", () => {
    expect(
      pickEmptyState({ hasGroups: false, hasItems: false, editable: true }),
    ).toBe("no-groups");
  });

  it("没有分类优先级高于空分类(无分类时不可能有 items)", () => {
    expect(
      pickEmptyState({ hasGroups: false, hasItems: false, editable: false }),
    ).toBe("no-groups");
  });

  it("有分类但当前分类没有任何 icon/widget 时返回 no-items", () => {
    expect(
      pickEmptyState({ hasGroups: true, hasItems: false, editable: true }),
    ).toBe("no-items");
  });

  it("当前分类已有内容时不显示空状态", () => {
    expect(
      pickEmptyState({ hasGroups: true, hasItems: true, editable: true }),
    ).toBeNull();
  });

  it("不可编辑(只读/访客)且没有分类时,仍展示 no-groups 但调用方据 editable 隐藏添加按钮", () => {
    // pickEmptyState 只决定「显示哪种空状态」,是否展示「添加」动作由 editable 单独控制;
    // 这里验证它不会因为 editable=false 就吞掉空状态卡片本身。
    expect(
      pickEmptyState({ hasGroups: false, hasItems: false, editable: false }),
    ).toBe("no-groups");
    expect(
      pickEmptyState({ hasGroups: true, hasItems: false, editable: false }),
    ).toBe("no-items");
  });
});
