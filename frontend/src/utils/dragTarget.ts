// UX-27: 统一跨分类拖拽到单一 @dnd-kit 实现后，「给定被拖元素 + over-id → 解析出应执行的动作」
// 这一步是纯逻辑，抽出来便于单测，也让 onDragEnd 只负责「按结果调用对应回调」。
//
// 改造前：分类内排序走 @dnd-kit，跨分类移动却另起一套——拖拽时用 pointermove 探测侧边栏
// 分类按钮的 bounding rect(几何命中)。两套机制并存，难维护也难测。
// 改造后：侧边栏分类按钮成为真正的 @dnd-kit droppable(useDroppable)，与网格元素同处一个
// DndContext，松手时 e.over.id 既可能是另一个网格元素(排序/合并)，也可能是某个分类 droppable。
//
// 本模块约定 droppable id 命名空间：
//   - 网格元素：直接用元素自身 id(icon/widget 的 id)。
//   - 侧边栏分类：用前缀 "group:" + groupId，避免与元素 id 冲突。
//
// resolveDragAction 不读 DOM、不碰几何，纯粹根据 id 与一点上下文给出动作类型。

/** 侧边栏分类 droppable id 前缀。 */
export const GROUP_DROPPABLE_PREFIX = "group:";

/** 构造某个分类的 droppable id。 */
export function groupDroppableId(groupId: string): string {
  return GROUP_DROPPABLE_PREFIX + groupId;
}

/** 若 over-id 是一个分类 droppable，返回其 groupId，否则返回 null。 */
export function parseGroupDroppableId(overId: string | null | undefined): string | null {
  if (typeof overId !== "string") return null;
  if (!overId.startsWith(GROUP_DROPPABLE_PREFIX)) return null;
  const gid = overId.slice(GROUP_DROPPABLE_PREFIX.length);
  return gid.length > 0 ? gid : null;
}

export type DragAction =
  /** 什么都不做(没有有效 over，或 over 就是自己)。 */
  | { type: "none" }
  /** 把被拖元素移动到另一个分类。 */
  | { type: "move-to-group"; groupId: string }
  /** 合并到另一张图标(成为/进入文件夹)。仅图标→图标。 */
  | { type: "merge"; targetId: string }
  /** 分类内重新排序，落到 overId 的位置。 */
  | { type: "reorder"; overId: string };

export interface ResolveDragActionInput {
  /** 被拖元素自身 id。 */
  activeId: string;
  /** @dnd-kit 给出的 over id(可能是元素 id、分类 droppable id，或空)。 */
  overId: string | null | undefined;
  /** 被拖元素当前所在分类(用于判断「移到自己分类」=无操作)。 */
  activeGroupId: string;
  /** 被拖元素是否为图标(只有图标能触发合并)。 */
  activeIsIcon: boolean;
  /**
   * 是否已确认为「合并目标」。合并需要更刻意的重叠 + 停留(见 mergeDecision.ts)，
   * 该判定在拖拽过程中完成，这里只接收其结果——若为 true 且 over 是另一张图标则合并。
   */
  mergeConfirmed: boolean;
  /** 已确认的合并目标 id(mergeConfirmed 为 true 时有效)。 */
  mergeTargetId?: string | null;
}

/**
 * 解析松手时应执行的动作。优先级：
 *   1) over 是分类 droppable 且不是当前分类 → move-to-group
 *   2) 合并已确认(图标 + 有合并目标) → merge
 *   3) over 是另一个网格元素 → reorder
 *   4) 否则 none
 */
export function resolveDragAction(input: ResolveDragActionInput): DragAction {
  const { activeId, overId, activeGroupId, activeIsIcon, mergeConfirmed, mergeTargetId } = input;

  // 1) 跨分类：over 命中某个分类 droppable。
  const overGroupId = parseGroupDroppableId(overId);
  if (overGroupId) {
    if (overGroupId === activeGroupId) return { type: "none" };
    return { type: "move-to-group", groupId: overGroupId };
  }

  // 2) 合并：仅图标，且过程中已确认了合并目标(刻意重叠 + 停留)。
  if (mergeConfirmed && activeIsIcon && mergeTargetId && mergeTargetId !== activeId) {
    return { type: "merge", targetId: mergeTargetId };
  }

  // 3) 分类内排序：over 是另一个网格元素。
  if (typeof overId === "string" && overId.length > 0 && overId !== activeId) {
    return { type: "reorder", overId };
  }

  // 4) 无操作。
  return { type: "none" };
}
