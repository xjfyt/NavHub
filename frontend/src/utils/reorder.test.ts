import { describe, it, expect } from "vitest";
import {
  moveById,
  reorderGroups,
  reorderIconsInGroup,
  reorderByIdList,
} from "./reorder";

type Item = { id: string };

describe("moveById", () => {
  const items: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("向下移动:把 a 移到 c 的位置", () => {
    expect(moveById(items, "a", "c").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("向上移动:把 d 移到 b 的位置", () => {
    expect(moveById(items, "d", "b").map((x) => x.id)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("相邻交换:把 b 移到 c 的位置", () => {
    expect(moveById(items, "b", "c").map((x) => x.id)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("no-op:from === to,数组不变(内容相同)", () => {
    expect(moveById(items, "b", "b").map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("from 不存在:返回原数组引用(无变化)", () => {
    expect(moveById(items, "zzz", "b")).toBe(items);
  });

  it("to 不存在:返回原数组引用(无变化)", () => {
    expect(moveById(items, "a", "zzz")).toBe(items);
  });

  it("纯函数:不修改入参数组", () => {
    const input: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const snapshot = input.map((x) => x.id);
    moveById(input, "a", "c");
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });

  it("空数组:返回原数组", () => {
    const empty: Item[] = [];
    expect(moveById(empty, "a", "b")).toBe(empty);
  });

  it("移到末尾:把 a 移到 d 的位置", () => {
    expect(moveById(items, "a", "d").map((x) => x.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("移到开头:把 d 移到 a 的位置", () => {
    expect(moveById(items, "d", "a").map((x) => x.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });
});

describe("reorderGroups", () => {
  const groups = [{ id: "g1" }, { id: "g2" }, { id: "g3" }];

  it("重排分组(等价 moveById)", () => {
    expect(reorderGroups(groups, "g1", "g3").map((g) => g.id)).toEqual([
      "g2",
      "g3",
      "g1",
    ]);
  });

  it("无效 id:返回原引用", () => {
    expect(reorderGroups(groups, "nope", "g3")).toBe(groups);
  });
});

describe("reorderIconsInGroup", () => {
  // 注意:数组里混了不同 group,只在同组内重排,其余原样保留(顺序为 rest + 重排后的同组)。
  const icons = [
    { id: "i1", groupId: "A" },
    { id: "i2", groupId: "B" },
    { id: "i3", groupId: "A" },
    { id: "i4", groupId: "A" },
    { id: "i5", groupId: "B" },
  ];

  it("同组内向下移动 i1 -> i4 的位置,返回 {icons, order}", () => {
    const r = reorderIconsInGroup(icons, "i1", "i4");
    expect(r).not.toBeNull();
    // 同组顺序:i3, i4, i1
    expect(r!.order).toEqual(["i3", "i4", "i1"]);
    expect(r!.groupId).toBe("A");
    // rest(其他组)在前,重排后的同组在后
    const ids = r!.icons.map((i) => i.id);
    expect(ids).toEqual(["i2", "i5", "i3", "i4", "i1"]);
  });

  it("跨组拖放:drag 与 drop 不同组 -> null(不处理)", () => {
    expect(reorderIconsInGroup(icons, "i1", "i2")).toBeNull();
  });

  it("drag 不存在 -> null", () => {
    expect(reorderIconsInGroup(icons, "zzz", "i4")).toBeNull();
  });

  it("drop 不存在 -> null", () => {
    expect(reorderIconsInGroup(icons, "i1", "zzz")).toBeNull();
  });

  it("no-op:drag === drop,同组顺序不变", () => {
    const r = reorderIconsInGroup(icons, "i1", "i1");
    expect(r).not.toBeNull();
    expect(r!.order).toEqual(["i1", "i3", "i4"]);
  });

  it("纯函数:不修改入参", () => {
    const snapshot = icons.map((i) => i.id);
    reorderIconsInGroup(icons, "i1", "i4");
    expect(icons.map((i) => i.id)).toEqual(snapshot);
  });
});

describe("reorderByIdList", () => {
  const items = [
    { id: "x", sortOrder: 0, name: "X" },
    { id: "y", sortOrder: 1, name: "Y" },
    { id: "z", sortOrder: 2, name: "Z" },
  ];

  it("按给定顺序重排,并把 sortOrder 重写为下标", () => {
    const r = reorderByIdList(items, ["z", "x", "y"]);
    expect(r.map((i) => i.id)).toEqual(["z", "x", "y"]);
    expect(r.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it("order 含未知 id:跳过未知项,sortOrder 沿用其在 order 中的下标(保留原实现语义,允许出现空档)", () => {
    const r = reorderByIdList(items, ["z", "ghost", "x"]);
    expect(r.map((i) => i.id)).toEqual(["z", "x"]);
    // "ghost" 占据 order 下标 1 被跳过,故 "x" 的 sortOrder 为 2(与原 useWorkspace 实现一致)。
    expect(r.map((i) => i.sortOrder)).toEqual([0, 2]);
  });

  it("order 缺项:缺失的不出现在结果里", () => {
    const r = reorderByIdList(items, ["y"]);
    expect(r.map((i) => i.id)).toEqual(["y"]);
    expect(r[0].sortOrder).toBe(0);
  });

  it("保留除 sortOrder 外的其它字段", () => {
    const r = reorderByIdList(items, ["y", "x", "z"]);
    expect(r[0].name).toBe("Y");
  });

  it("纯函数:不修改入参元素的 sortOrder", () => {
    reorderByIdList(items, ["z", "y", "x"]);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it("空 order:返回空数组", () => {
    expect(reorderByIdList(items, [])).toEqual([]);
  });
});
