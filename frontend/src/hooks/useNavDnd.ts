import { useCallback, useMemo, useRef, useState } from "react";
import {
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { IconView, WidgetView } from "../types";
import {
  mouseActivationConstraint,
  touchActivationConstraint,
} from "../utils/dndSensors";
import {
  meetsMergeOverlap,
  shouldMergeWithTarget,
  MERGE_DWELL_MS,
} from "../utils/mergeDecision";
import { resolveDragAction, parseGroupDroppableId } from "../utils/dragTarget";
import { WIDGET_REGISTRY, WidgetSizeId, snapWidgetSize } from "../widgets";

// =================================================================
// useNavDnd —— 把图标网格的拖拽协调逻辑从 NavView 抽出，使其能在 Shell 层与
// 侧边栏共处同一个 <DndContext>。这样 UX-27 得以统一：
//   • 分类内排序、文件夹合并、跨分类移动 全部走同一个 @dnd-kit DndContext / onDragEnd。
//   • 侧边栏分类按钮成为真正的 useDroppable，松手时 e.over.id 指向 "group:<id>"。
//   • 不再用 pointermove 探测侧边栏按钮 rect(几何命中)，也不再有 400ms 悬停实时预览。
//
// 仍保留的几何逻辑只剩「文件夹合并」的重叠检测(UX-20)，因为 @dnd-kit 的 over 不带
// 重叠率/停留信息，合并需要更刻意的判定。该判定用纯函数(mergeDecision.ts)，本 hook
// 只在 onDragMove 里算重叠率并维护「确认的合并目标」。
// =================================================================

export type CellSpan = { w: number; h: number };

function spanForIcon(icon: IconView): CellSpan {
  if (icon.isFolder) {
    if (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg")
      return { w: 2, h: 2 };
    if (icon.size === "pill-size") return { w: 3, h: 1 };
    return { w: 1, h: 1 };
  }
  if (icon.size === "lg") return { w: 2, h: 2 };
  if (icon.size === "pill-size") return { w: 3, h: 1 };
  return { w: 1, h: 1 };
}

function spanForWidget(widget: WidgetView): CellSpan {
  const reg = WIDGET_REGISTRY[widget.widget];
  const sizeKey = (snapWidgetSize(widget.wSpan, widget.wRow) ||
    reg?.defaultSize ||
    "medium") as WidgetSizeId;
  if (sizeKey === "small") return { w: 3, h: 1 };
  if (sizeKey === "large") return { w: 4, h: 2 };
  return { w: 2, h: 2 };
}

export type NavGridItem =
  | {
      kind: "icon";
      id: string;
      icon: IconView;
      sortOrder: number;
      span: CellSpan;
    }
  | {
      kind: "widget";
      id: string;
      widget: WidgetView;
      sortOrder: number;
      span: CellSpan;
    };

export interface UseNavDndArgs {
  activeGroup: string;
  icons: IconView[];
  widgets: WidgetView[];
  /** 分类内重排(只改 sortOrder)。 */
  onReorderGroupItems: (
    groupId: string,
    items: {
      id: string;
      type: "icon" | "widget";
      x: number | null;
      y: number | null;
    }[],
  ) => void;
  /** 合并到文件夹。 */
  onMergeIcon: (dragId: string, targetId: string) => void;
  /** 跨分类移动(落到目标分类的 targetIndex)。 */
  onMoveGroupItem?: (
    itemType: "icon" | "widget",
    itemId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void | Promise<void>;
  /** 解析分类 id → 名字(供「已移动到「分类名」」toast 用)。 */
  groupName?: (groupId: string) => string | undefined;
}

export interface UseNavDndResult {
  sensors: ReturnType<typeof useSensors>;
  gridItems: NavGridItem[];
  activeId: string | null;
  activeItem: NavGridItem | null;
  /** 当前是否有元素正被拖拽(供侧边栏决定是否亮起 droppable)。 */
  isDragging: boolean;
  /** 自定义碰撞检测：分类 droppable 只在指针真正落入其内才命中(与旧几何行为一致)，
      否则在网格元素中按 closestCenter 选——避免靠近侧边栏排序时误判为跨分类。 */
  collisionDetection: CollisionDetection;
  /** 正在执行的跨分类移动(进度态)，落地后清空。 */
  pendingMove: { itemId: string; toGroupId: string } | null;
  onDragStart: (e: DragStartEvent) => void;
  onDragMove: (e: DragMoveEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
}

export function useNavDnd(args: UseNavDndArgs): UseNavDndResult {
  const {
    activeGroup,
    icons,
    widgets,
    onReorderGroupItems,
    onMergeIcon,
    onMoveGroupItem,
    groupName,
  } = args;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    itemId: string;
    toGroupId: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: mouseActivationConstraint }),
    useSensor(TouchSensor, { activationConstraint: touchActivationConstraint }),
  );

  // 自定义碰撞检测：
  //  1) 先用 pointerWithin 找指针真正落入的 droppable；若其中有分类(group:*)，优先命中——
  //     这复刻了旧几何路径「指针必须落在分类按钮矩形内」的严格度，靠近侧边栏排序不会误判。
  //  2) 否则只在「非分类」(网格元素) droppable 里按 closestCenter 选，保持原排序/合并手感。
  const collisionDetection = useCallback<CollisionDetection>((cdArgs) => {
    const within = pointerWithin(cdArgs);
    const groupHit = within.find(
      (c) => parseGroupDroppableId(String(c.id)) !== null,
    );
    if (groupHit) return [groupHit];
    const gridContainers = cdArgs.droppableContainers.filter(
      (c) => parseGroupDroppableId(String(c.id)) === null,
    );
    return closestCenter({ ...cdArgs, droppableContainers: gridContainers });
  }, []);

  const currentIcons = useMemo(
    () => icons.filter((i) => i.groupId === activeGroup),
    [icons, activeGroup],
  );
  const currentWidgets = useMemo(
    () => widgets.filter((w) => w.groupId === activeGroup),
    [widgets, activeGroup],
  );

  const gridItems = useMemo<NavGridItem[]>(() => {
    const arr: NavGridItem[] = [
      ...currentWidgets
        .filter((w) => !WIDGET_REGISTRY[w.widget]?.floatingBar)
        .map((w) => ({
          kind: "widget" as const,
          id: w.id,
          widget: w,
          sortOrder: w.sortOrder,
          span: spanForWidget(w),
        })),
      ...currentIcons.map((i) => ({
        kind: "icon" as const,
        id: i.id,
        icon: i,
        sortOrder: i.sortOrder,
        span: spanForIcon(i),
      })),
    ];
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return arr;
  }, [currentIcons, currentWidgets]);

  // ----- 文件夹合并目标(几何重叠 + 停留)的内部态 (UX-20) -----
  const mergeTargetRef = useRef<string | null>(null);
  const mergeTargetElRef = useRef<HTMLElement | null>(null);
  const mergeCandidateRef = useRef<string | null>(null);
  const mergeCandidateSinceRef = useRef<number>(0);
  const mergeDwellTimerRef = useRef<number | null>(null);

  const clearMergeDwellTimer = () => {
    if (mergeDwellTimerRef.current !== null) {
      window.clearTimeout(mergeDwellTimerRef.current);
      mergeDwellTimerRef.current = null;
    }
  };

  const clearMergeTarget = () => {
    if (mergeTargetElRef.current) {
      mergeTargetElRef.current.classList.remove(
        "merge-target-glow",
        "merge-target-folder",
      );
      mergeTargetElRef.current.style.transform = "";
      mergeTargetElRef.current.style.boxShadow = "";
      mergeTargetElRef.current = null;
    }
    mergeTargetRef.current = null;
    mergeCandidateRef.current = null;
    mergeCandidateSinceRef.current = 0;
    clearMergeDwellTimer();
  };

  const confirmMergeHighlight = (el: HTMLElement, isFolder: boolean) => {
    const id = el.dataset.navItemId ?? null;
    if (!id || mergeTargetRef.current === id) return;
    if (mergeTargetElRef.current && mergeTargetElRef.current !== el) {
      mergeTargetElRef.current.classList.remove(
        "merge-target-glow",
        "merge-target-folder",
      );
      mergeTargetElRef.current.style.transform = "";
      mergeTargetElRef.current.style.boxShadow = "";
    }
    mergeTargetRef.current = id;
    mergeTargetElRef.current = el;
    el.classList.add("merge-target-glow");
    if (isFolder) el.classList.add("merge-target-folder");
    el.style.transition = "transform .18s var(--spring), box-shadow .18s";
    el.style.transform = isFolder ? "scale(1.10)" : "scale(1.06)";
    el.style.boxShadow = isFolder
      ? "0 0 0 4px rgba(155,231,180,0.85), 0 0 28px rgba(155,231,180,0.45)"
      : "0 0 0 3px rgba(255,215,165,0.75), 0 0 20px rgba(255,215,165,0.35)";
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  // onDragMove 现在只负责「文件夹合并」的几何重叠检测；跨分类改由 @dnd-kit droppable 命中。
  const onDragMove = (e: DragMoveEvent) => {
    const draggedId = activeId ?? String(e.active.id);
    const draggedItem = gridItems.find((it) => it.id === draggedId);
    if (!draggedItem || draggedItem.kind !== "icon") {
      clearMergeTarget();
      return;
    }
    const draggedRect = e.active.rect.current?.translated ?? null;
    if (!draggedRect) {
      clearMergeTarget();
      return;
    }
    const overlapRatio = (
      a: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      },
      b: DOMRect,
    ) => {
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (left >= right || top >= bottom) return 0;
      const inter = (right - left) * (bottom - top);
      const draggedArea = a.width * a.height;
      return draggedArea > 0 ? inter / draggedArea : 0;
    };
    const iconEls = document.querySelectorAll<HTMLElement>(
      "[data-nav-item-type='icon']",
    );
    let foundEl: HTMLElement | null = null;
    let foundIsFolder = false;
    let bestRatio = 0;
    for (const el of Array.from(iconEls)) {
      const id = el.dataset.navItemId;
      if (!id || id === draggedId) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const isFolder = el.dataset.navItemFolder === "true";
      const ratio = overlapRatio(draggedRect, r);
      if (meetsMergeOverlap(ratio, isFolder) && ratio > bestRatio) {
        foundEl = el;
        foundIsFolder = isFolder;
        bestRatio = ratio;
      }
    }

    if (!foundEl) {
      clearMergeTarget();
      return;
    }

    const candidateId = foundEl.dataset.navItemId!;
    const now = Date.now();
    if (mergeCandidateRef.current !== candidateId) {
      mergeCandidateRef.current = candidateId;
      mergeCandidateSinceRef.current = now;
      clearMergeDwellTimer();
    }
    const dwellMs = now - mergeCandidateSinceRef.current;

    if (
      shouldMergeWithTarget({
        overlapRatio: bestRatio,
        dwellMs,
        isFolder: foundIsFolder,
      })
    ) {
      clearMergeDwellTimer();
      confirmMergeHighlight(foundEl, foundIsFolder);
      return;
    }

    if (mergeTargetRef.current && mergeTargetRef.current !== candidateId) {
      if (mergeTargetElRef.current) {
        mergeTargetElRef.current.classList.remove(
          "merge-target-glow",
          "merge-target-folder",
        );
        mergeTargetElRef.current.style.transform = "";
        mergeTargetElRef.current.style.boxShadow = "";
        mergeTargetElRef.current = null;
      }
      mergeTargetRef.current = null;
    }
    if (mergeDwellTimerRef.current === null) {
      const elToConfirm = foundEl;
      const isFolderToConfirm = foundIsFolder;
      const remaining = Math.max(0, MERGE_DWELL_MS - dwellMs);
      mergeDwellTimerRef.current = window.setTimeout(() => {
        mergeDwellTimerRef.current = null;
        if (mergeCandidateRef.current === candidateId) {
          confirmMergeHighlight(elToConfirm, isFolderToConfirm);
        }
      }, remaining);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const dragId = activeId ?? String(e.active.id);
    setActiveId(null);

    // 解析松手动作：分类 droppable / 合并 / 排序，全部由纯函数 resolveDragAction 决定。
    const draggedItem = gridItems.find((it) => it.id === dragId);
    const mergeConfirmed = mergeTargetRef.current !== null;
    const mergeTargetId = mergeTargetRef.current;
    const mergeTargetEl = mergeTargetElRef.current;

    const action = resolveDragAction({
      activeId: dragId,
      overId: e.over?.id != null ? String(e.over.id) : null,
      activeGroupId: activeGroup,
      activeIsIcon: draggedItem?.kind === "icon",
      mergeConfirmed,
      mergeTargetId,
    });

    // 不论走哪条分支，都要把合并高亮状态收尾(但 merge 分支要先取出再清)。
    if (action.type !== "merge") clearMergeTarget();

    if (action.type === "move-to-group") {
      if (draggedItem && onMoveGroupItem) {
        setPendingMove({ itemId: dragId, toGroupId: action.groupId });
        const name = groupName?.(action.groupId);
        // 进度态：移动 API 期间显示 loading toast(同一 id)，落地后原地替换为成功/失败。
        const toastId = `nav-move-${dragId}`;
        toast.loading(name ? `正在移动到「${name}」…` : "正在移动…", {
          id: toastId,
        });
        Promise.resolve(
          onMoveGroupItem(draggedItem.kind, draggedItem.id, action.groupId, 0),
        )
          .then(() => {
            toast.success(name ? `已移动到「${name}」` : "已移动到其他分类", {
              id: toastId,
            });
          })
          .catch(() => {
            toast.error("移动失败", { id: toastId });
          })
          .finally(() => {
            setPendingMove(null);
          });
      }
      return;
    }

    if (action.type === "merge") {
      mergeTargetRef.current = null;
      mergeTargetElRef.current = null;
      mergeCandidateRef.current = null;
      mergeCandidateSinceRef.current = 0;
      clearMergeDwellTimer();
      if (mergeTargetEl) {
        mergeTargetEl.classList.remove(
          "merge-target-glow",
          "merge-target-folder",
        );
        mergeTargetEl.style.transform = "";
        mergeTargetEl.style.boxShadow = "";
        mergeTargetEl.classList.add("merge-absorb");
      }
      const targetId = action.targetId;
      window.setTimeout(() => {
        onMergeIcon(dragId, targetId);
        mergeTargetEl?.classList.remove("merge-absorb");
      }, 280);
      return;
    }

    if (action.type === "reorder") {
      const oldIdx = gridItems.findIndex((it) => it.id === dragId);
      const newIdx = gridItems.findIndex((it) => it.id === action.overId);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(gridItems, oldIdx, newIdx);
      onReorderGroupItems(
        activeGroup,
        reordered.map((it) => ({ id: it.id, type: it.kind, x: null, y: null })),
      );
      return;
    }
    // action.type === "none" → 什么都不做。
  };

  const onDragCancel = () => {
    setActiveId(null);
    clearMergeTarget();
  };

  const activeItem = activeId
    ? (gridItems.find((it) => it.id === activeId) ?? null)
    : null;

  return {
    sensors,
    gridItems,
    activeId,
    activeItem,
    isDragging: activeId !== null,
    collisionDetection,
    pendingMove,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
  };
}
