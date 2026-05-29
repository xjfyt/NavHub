import { describe, it, expect } from "vitest";
import {
  groupDroppableId,
  parseGroupDroppableId,
  resolveDragAction,
  GROUP_DROPPABLE_PREFIX,
} from "./dragTarget";

describe("group droppable id 命名空间", () => {
  it("构造与解析互逆", () => {
    expect(groupDroppableId("g1")).toBe(GROUP_DROPPABLE_PREFIX + "g1");
    expect(parseGroupDroppableId(groupDroppableId("abc"))).toBe("abc");
  });

  it("非分类 id(普通元素 id / 空 / 非串)→ null", () => {
    expect(parseGroupDroppableId("icon-123")).toBe(null);
    expect(parseGroupDroppableId("")).toBe(null);
    expect(parseGroupDroppableId(null)).toBe(null);
    expect(parseGroupDroppableId(undefined)).toBe(null);
    // 前缀但无 groupId
    expect(parseGroupDroppableId(GROUP_DROPPABLE_PREFIX)).toBe(null);
  });
});

describe("resolveDragAction", () => {
  const base = {
    activeId: "icon-1",
    activeGroupId: "gA",
    activeIsIcon: true,
    mergeConfirmed: false,
    mergeTargetId: null as string | null,
  };

  it("over 命中其他分类 droppable → move-to-group", () => {
    expect(
      resolveDragAction({ ...base, overId: groupDroppableId("gB") }),
    ).toEqual({ type: "move-to-group", groupId: "gB" });
  });

  it("over 命中「当前分类」droppable → none(移到自己分类无意义)", () => {
    expect(
      resolveDragAction({ ...base, overId: groupDroppableId("gA") }),
    ).toEqual({ type: "none" });
  });

  it("合并已确认 + 图标 + 有目标 → merge", () => {
    expect(
      resolveDragAction({
        ...base,
        overId: "icon-2",
        mergeConfirmed: true,
        mergeTargetId: "icon-2",
      }),
    ).toEqual({ type: "merge", targetId: "icon-2" });
  });

  it("分类优先于合并：即便合并已确认，over 命中分类 droppable 仍走 move-to-group", () => {
    expect(
      resolveDragAction({
        ...base,
        overId: groupDroppableId("gB"),
        mergeConfirmed: true,
        mergeTargetId: "icon-2",
      }),
    ).toEqual({ type: "move-to-group", groupId: "gB" });
  });

  it("合并未确认 + over 是另一个元素 → reorder", () => {
    expect(resolveDragAction({ ...base, overId: "icon-2" })).toEqual({
      type: "reorder",
      overId: "icon-2",
    });
  });

  it("widget(非图标)即便 mergeConfirmed 也不合并，走 reorder", () => {
    expect(
      resolveDragAction({
        ...base,
        activeId: "w-1",
        activeIsIcon: false,
        overId: "icon-2",
        mergeConfirmed: true,
        mergeTargetId: "icon-2",
      }),
    ).toEqual({ type: "reorder", overId: "icon-2" });
  });

  it("over 是自己 → none", () => {
    expect(resolveDragAction({ ...base, overId: "icon-1" })).toEqual({
      type: "none",
    });
  });

  it("没有 over → none", () => {
    expect(resolveDragAction({ ...base, overId: null })).toEqual({
      type: "none",
    });
    expect(resolveDragAction({ ...base, overId: undefined })).toEqual({
      type: "none",
    });
  });

  it("合并已确认但目标就是自己 → 退化为 reorder/none(不自合并)", () => {
    expect(
      resolveDragAction({
        ...base,
        overId: "icon-1",
        mergeConfirmed: true,
        mergeTargetId: "icon-1",
      }),
    ).toEqual({ type: "none" });
  });
});
