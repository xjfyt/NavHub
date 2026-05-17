import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GroupView, IconView, Tweaks, WidgetView } from "../types";
import { IconTile } from "./IconTile";
import { Icon } from "./Icon";
import {
  WIDGET_REGISTRY,
  WidgetSizeId,
  snapWidgetSize,
} from "../widgets";

// =================================================================
// CSS Grid 单元格尺寸：图标/小组件按 cell 数量 (w × h) 占位。
//
//   sq / circle / 普通文件夹    : 1 × 1
//   pill (横长胶囊) / 折叠文件夹 : 2 × 1
//   lg / lg-4 / lg-9           : 2 × 2
//   widget small               : 2 × 1
//   widget medium              : 2 × 2
//   widget large               : 4 × 2
//
// 实际像素由 CSS 变量 `--nav-cell-w` / `--nav-cell-h` 控制。
// =================================================================

type CellSpan = { w: number; h: number };

function spanForIcon(icon: IconView): CellSpan {
  if (icon.isFolder) {
    if (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg") return { w: 2, h: 2 };
    if (icon.size === "pill-size") return { w: 3, h: 1 };
    return { w: 1, h: 1 };
  }
  if (icon.size === "lg") return { w: 2, h: 2 };
  if (icon.size === "pill-size") return { w: 3, h: 1 };
  return { w: 1, h: 1 };
}

function spanForWidget(widget: WidgetView): CellSpan {
  const reg = WIDGET_REGISTRY[widget.widget];
  const sizeKey = (snapWidgetSize(widget.wSpan, widget.wRow) || reg?.defaultSize || "medium") as WidgetSizeId;
  if (sizeKey === "small") return { w: 3, h: 1 };
  if (sizeKey === "large") return { w: 4, h: 2 };
  return { w: 2, h: 2 };
}

type Item =
  | { kind: "icon"; id: string; icon: IconView; sortOrder: number; span: CellSpan }
  | { kind: "widget"; id: string; widget: WidgetView; sortOrder: number; span: CellSpan };

// =================================================================
// NavView：分类下的 icon / widget 网格。
//
// 设计原则：
//  • 使用原生 CSS Grid (auto-flow: row dense)；每个元素只通过 sortOrder 决定顺序，
//    位置由浏览器自动计算，不再保存 gridX/gridY。
//  • 搜索条等 floatingBar 小组件单独渲染在网格之上，不参与排序、不可拖。
//  • 拖拽用 @dnd-kit/sortable，松手只更新 sortOrder。
//  • 跨分类拖拽：拖动期间用 pointermove 命中 sidebar 上的分类按钮。
//  • 文件夹合并：拖动期间用 pointermove 命中其他 icon 中心区。
// =================================================================

export const NavView = ({
  activeGroup,
  groups,
  icons,
  widgets,
  tweaks,
  setActiveGroup,
  onOpenIcon,
  onCtxTile,
  onAddClick,
  onReorderGroupItems,
  onMergeIcon,
  onMoveGroupItem,
  onExpandWidget,
  onExtractFolderItem,
}: {
  activeGroup: string;
  groups: GroupView[];
  icons: IconView[];
  widgets: WidgetView[];
  tweaks: Tweaks;
  setActiveGroup: (id: string) => void;
  onOpenIcon: (e: React.MouseEvent | React.DragEvent | null, icon: IconView) => void;
  onCtxTile: (e: React.MouseEvent, item: IconView | WidgetView) => void;
  onAddClick: (e: React.MouseEvent) => void;
  onReorderGroupItems: (
    groupId: string,
    items: { id: string; type: "icon" | "widget"; x: number | null; y: number | null }[],
  ) => void;
  onMergeIcon: (dragId: string, targetId: string) => void;
  onMoveGroupItem?: (
    itemType: "icon" | "widget",
    itemId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
  onExpandWidget?: (w: WidgetView) => void;
  onExtractFolderItem?: (folderId: string, itemId: string) => void;
}) => {
  const [slideDir, setSlideDir] = useState(0);
  const [newIconIds, setNewIconIds] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const prevActiveGroupRef = useRef<string | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIconIdsRef = useRef<Set<string>>(new Set());

  // ----- 切换分类的滑入动画 -----
  useEffect(() => {
    const prevId = prevActiveGroupRef.current;
    prevActiveGroupRef.current = activeGroup;
    if (prevId === null || prevId === activeGroup) return;
    const prevIdx = groups.findIndex((g) => g.id === prevId);
    const nextIdx = groups.findIndex((g) => g.id === activeGroup);
    if (prevIdx === -1 || nextIdx === -1) return;
    const dir = nextIdx > prevIdx ? 1 : -1;
    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
    setSlideDir(dir);
    slideTimerRef.current = setTimeout(() => setSlideDir(0), 380);
  }, [activeGroup, groups]);

  // ----- 滚轮翻页 -----
  const wheelLockRef = useRef(0);
  const wheelAccumRef = useRef(0);
  // 记录最近一次「本分类还能继续滚动」的时间，用于边界冷却：
  // 触控板惯性滑动在到达边缘的瞬间仍会持续发事件，没有冷却就会立刻跨页。
  const lastNativeScrollRef = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (tweaks.wheelPage === false) return;
    const ay = Math.abs(e.deltaY), ax = Math.abs(e.deltaX);
    if (ay < ax) return;
    // 1) 子元素自带滚动条 → 让子元素吃滚轮
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight) return;
      el = el.parentElement;
    }
    // 2) 当前分类自身还能滚 → 走原生滚动，重置翻页累积
    const container = e.currentTarget as HTMLDivElement;
    const canScrollDown = container.scrollTop + container.clientHeight < container.scrollHeight - 1;
    const canScrollUp = container.scrollTop > 0;
    if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
      wheelAccumRef.current = 0;
      lastNativeScrollRef.current = Date.now();
      return;
    }
    // 3) 已到顶/底：边界后 280ms 内的惯性事件忽略，防止"刚到边就被甩到下一分类"
    const now = Date.now();
    if (now - lastNativeScrollRef.current < 280) return;
    if (now < wheelLockRef.current) return;
    wheelAccumRef.current += e.deltaY;
    const threshold = tweaks.wheelSensitivity ?? 40;
    if (Math.abs(wheelAccumRef.current) < threshold) return;
    const dir = wheelAccumRef.current > 0 ? 1 : -1;
    const idx = groups.findIndex((g) => g.id === activeGroup);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= groups.length) {
      wheelAccumRef.current = 0;
      wheelLockRef.current = now + 150;
      return;
    }
    wheelAccumRef.current = 0;
    wheelLockRef.current = now + 520;
    setActiveGroup(groups[nextIdx].id);
  };

  const currentIcons = useMemo(() => icons.filter((i) => i.groupId === activeGroup), [icons, activeGroup]);
  const currentWidgets = useMemo(() => widgets.filter((w) => w.groupId === activeGroup), [widgets, activeGroup]);

  // 新增图标的 pop-in 动画
  useEffect(() => {
    const currentIds = new Set(currentIcons.map((i) => i.id));
    const added: string[] = [];
    currentIds.forEach((id) => { if (!prevIconIdsRef.current.has(id)) added.push(id); });
    prevIconIdsRef.current = currentIds;
    if (added.length === 0) return;
    setNewIconIds(new Set(added));
    const t = setTimeout(() => setNewIconIds(new Set()), 400);
    return () => clearTimeout(t);
  }, [currentIcons]);

  // 拆分悬浮条小组件（独立渲染于顶部）和参与排序的网格元素。
  const floatingBars = useMemo(
    () =>
      currentWidgets
        .filter((w) => WIDGET_REGISTRY[w.widget]?.floatingBar)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [currentWidgets],
  );

  // ----- 跨分类「实时预览」状态 -----
  // 用户拖拽时悬停在侧边栏目标分类按钮 ~400ms，会 setActiveGroup 把视图切到目标分类，
  // 同时把被拖元素「临时」加进目标分类的 gridItems（数据未落库）。这样 @dnd-kit 的拖拽
  // 不中断，用户可以继续在目标分类里挑位置后松手。
  // 落地（onDragEnd）时根据 sortable 的最终位置一次性提交 onMoveGroupItem(targetIndex)。
  // 取消（onDragCancel/escape）则把 activeGroup 切回源分类，丢弃预览。
  const [pendingGroupOverride, setPendingGroupOverride] = useState<{
    itemId: string;
    fromGroupId: string;
    toGroupId: string;
  } | null>(null);

  const gridItems = useMemo<Item[]>(() => {
    const arr: Item[] = [
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
    // 如果有 pending override 且目标 group == 当前 activeGroup，
    // 把源 group 里那个被拖的元素「插入」当前 grid 末尾，让 @dnd-kit 仍然认得它。
    if (
      pendingGroupOverride &&
      pendingGroupOverride.toGroupId === activeGroup &&
      !arr.some((it) => it.id === pendingGroupOverride.itemId)
    ) {
      const itemId = pendingGroupOverride.itemId;
      const ic = icons.find((i) => i.id === itemId);
      if (ic) {
        arr.push({
          kind: "icon",
          id: ic.id,
          icon: ic,
          sortOrder: arr.length,
          span: spanForIcon(ic),
        });
      } else {
        const wd = widgets.find((w) => w.id === itemId);
        if (wd) {
          arr.push({
            kind: "widget",
            id: wd.id,
            widget: wd,
            sortOrder: arr.length,
            span: spanForWidget(wd),
          });
        }
      }
    }
    return arr;
  }, [currentIcons, currentWidgets, pendingGroupOverride, activeGroup, icons, widgets]);

  // ----- 拖拽态 -----
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // 跨分类目标（侧边栏分类按钮）
  const groupTargetRef = useRef<string | null>(null);
  const groupTargetElRef = useRef<HTMLElement | null>(null);
  // 跨分类悬停定时器：悬停 400ms 才触发实时切换。
  const hoverSwitchTimerRef = useRef<number | null>(null);
  // 文件夹合并目标（另一个 icon）
  const mergeTargetRef = useRef<string | null>(null);
  const mergeTargetElRef = useRef<HTMLElement | null>(null);

  const clearHoverSwitchTimer = () => {
    if (hoverSwitchTimerRef.current !== null) {
      window.clearTimeout(hoverSwitchTimerRef.current);
      hoverSwitchTimerRef.current = null;
    }
  };

  const clearGroupTarget = () => {
    if (groupTargetElRef.current) {
      groupTargetElRef.current.classList.remove("drag-group-target");
      groupTargetElRef.current = null;
    }
    groupTargetRef.current = null;
    clearHoverSwitchTimer();
  };
  const clearMergeTarget = () => {
    if (mergeTargetElRef.current) {
      mergeTargetElRef.current.classList.remove("merge-target-glow", "merge-target-folder");
      mergeTargetElRef.current.style.transform = "";
      mergeTargetElRef.current.style.boxShadow = "";
      mergeTargetElRef.current = null;
    }
    mergeTargetRef.current = null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragMove = (e: DragMoveEvent) => {
    const activator = e.activatorEvent as PointerEvent | undefined;
    if (!activator || typeof activator.clientX !== "number") return;
    const px = activator.clientX + e.delta.x;
    const py = activator.clientY + e.delta.y;
    const draggedId = activeId ?? String(e.active.id);

    // 1) 命中侧边栏分类按钮 → 跨分类目标
    const groupBtns = document.querySelectorAll<HTMLElement>(".side-btn.cat[data-group-id]");
    let foundGroupEl: HTMLElement | null = null;
    let foundGroupId: string | null = null;
    for (const btn of Array.from(groupBtns)) {
      const r = btn.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        foundGroupEl = btn;
        foundGroupId = btn.dataset.groupId ?? null;
        break;
      }
    }
    if (foundGroupEl && foundGroupId && foundGroupId !== activeGroup) {
      if (groupTargetRef.current !== foundGroupId) {
        clearGroupTarget();
        clearMergeTarget();
        groupTargetRef.current = foundGroupId;
        groupTargetElRef.current = foundGroupEl;
        foundGroupEl.classList.add("drag-group-target");
        // 启动 400ms 悬停定时器：用户在该按钮上停够 400ms 才把视图切到目标分类，
        // 避免拖拽路径上「擦过」按钮导致的误切。切换是「实时预览」——只更新视图，
        // 数据落库放到 onDragEnd。
        const targetGroupId = foundGroupId;
        const draggedItemId = draggedId;
        clearHoverSwitchTimer();
        hoverSwitchTimerRef.current = window.setTimeout(() => {
          hoverSwitchTimerRef.current = null;
          // 找出元素的源 group（拖拽开始时它所在的分类）
          const ic = icons.find((i) => i.id === draggedItemId);
          const wd = widgets.find((w) => w.id === draggedItemId);
          const fromGroupId = ic?.groupId ?? wd?.groupId;
          if (!fromGroupId || fromGroupId === targetGroupId) return;
          setPendingGroupOverride({
            itemId: draggedItemId,
            fromGroupId,
            toGroupId: targetGroupId,
          });
          setActiveGroup(targetGroupId);
        }, 400);
      }
      return;
    }
    clearGroupTarget();

    // 2) 合并 / 落入文件夹检测
    //    重叠率 = 交集面积 / 拖拽元素自身面积。以「拖动这张图标自己进去多少」为口径，
    //    比之前 min(两边面积) 更稳定（受目标尺寸变化影响小，sortable 推开邻居时仍可命中）。
    //    门槛大幅下调：普通图标 30%、文件夹 18%，使合并体验接近 iOS 那种"贴上去就吸"。
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
    const overlapRatio = (a: { left: number; top: number; right: number; bottom: number; width: number; height: number }, b: DOMRect) => {
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (left >= right || top >= bottom) return 0;
      const inter = (right - left) * (bottom - top);
      const draggedArea = a.width * a.height;
      return draggedArea > 0 ? inter / draggedArea : 0;
    };
    const iconEls = document.querySelectorAll<HTMLElement>("[data-nav-item-type='icon']");
    let foundMergeEl: HTMLElement | null = null;
    let bestRatio = 0;
    for (const el of Array.from(iconEls)) {
      const id = el.dataset.navItemId;
      if (!id || id === draggedId) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const isFolder = el.dataset.navItemFolder === "true";
      const threshold = isFolder ? 0.18 : 0.3;
      const ratio = overlapRatio(draggedRect, r);
      if (ratio >= threshold && ratio > bestRatio) {
        foundMergeEl = el;
        bestRatio = ratio;
      }
    }
    if (foundMergeEl) {
      const id = foundMergeEl.dataset.navItemId!;
      const isFolder = foundMergeEl.dataset.navItemFolder === "true";
      if (mergeTargetRef.current !== id) {
        clearMergeTarget();
        mergeTargetRef.current = id;
        mergeTargetElRef.current = foundMergeEl;
        foundMergeEl.classList.add("merge-target-glow");
        if (isFolder) foundMergeEl.classList.add("merge-target-folder");
        foundMergeEl.style.transition =
          "transform .18s var(--spring), box-shadow .18s";
        foundMergeEl.style.transform = isFolder ? "scale(1.10)" : "scale(1.06)";
        foundMergeEl.style.boxShadow = isFolder
          ? "0 0 0 4px rgba(155,231,180,0.85), 0 0 28px rgba(155,231,180,0.45)"
          : "0 0 0 3px rgba(255,215,165,0.75), 0 0 20px rgba(255,215,165,0.35)";
      }
    } else {
      clearMergeTarget();
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const dragId = activeId ?? String(e.active.id);
    setActiveId(null);
    clearHoverSwitchTimer();

    // 1) 实时预览生效中：用户已经在目标分类里挑了具体位置 → 一次性提交跨分类移动 + 排序。
    if (pendingGroupOverride && pendingGroupOverride.itemId === dragId) {
      const { toGroupId } = pendingGroupOverride;
      setPendingGroupOverride(null);
      const targetEl = groupTargetElRef.current;
      clearGroupTarget();
      clearMergeTarget();
      const draggedItem = gridItems.find((it) => it.id === dragId);
      if (draggedItem && onMoveGroupItem) {
        // sortable 在当前 grid（已包含被拖元素）里给出 over —— 用 arrayMove 算出新位置。
        const overId = e.over?.id;
        let targetIndex = gridItems.findIndex((it) => it.id === dragId);
        if (overId && overId !== dragId) {
          const oldIdx = gridItems.findIndex((it) => it.id === dragId);
          const newIdx = gridItems.findIndex((it) => it.id === overId);
          if (oldIdx >= 0 && newIdx >= 0) targetIndex = newIdx;
        }
        if (targetIndex < 0) targetIndex = 0;
        onMoveGroupItem(draggedItem.kind, draggedItem.id, toGroupId, targetIndex);
        if (targetEl) {
          targetEl.classList.add("group-receive-pulse");
          window.setTimeout(() => targetEl.classList.remove("group-receive-pulse"), 520);
        }
      }
      return;
    }

    // 2) 仅悬停过侧边栏但还没等够 400ms 就放手 → 走老的「丢到目标分类顶部」逻辑。
    if (groupTargetRef.current) {
      const targetGroupId = groupTargetRef.current;
      const draggedItem = gridItems.find((it) => it.id === dragId);
      const targetEl = groupTargetElRef.current;
      clearGroupTarget();
      clearMergeTarget();
      if (draggedItem && onMoveGroupItem) {
        onMoveGroupItem(draggedItem.kind, draggedItem.id, targetGroupId, 0);
        if (targetEl) {
          targetEl.classList.add("group-receive-pulse");
          window.setTimeout(() => targetEl.classList.remove("group-receive-pulse"), 520);
        }
      }
      return;
    }

    // 3) 文件夹合并
    if (mergeTargetRef.current && dragId) {
      const targetId = mergeTargetRef.current;
      const targetEl = mergeTargetElRef.current;
      mergeTargetRef.current = null;
      mergeTargetElRef.current = null;
      if (targetEl) {
        targetEl.classList.remove("merge-target-glow");
        targetEl.style.transform = "";
        targetEl.style.boxShadow = "";
        targetEl.classList.add("merge-absorb");
      }
      window.setTimeout(() => {
        onMergeIcon(dragId, targetId);
        targetEl?.classList.remove("merge-absorb");
      }, 280);
      return;
    }
    clearMergeTarget();

    // 4) 普通排序：用 sortable 的 over 计算新顺序
    const overId = e.over?.id;
    if (!overId || overId === e.active.id || !dragId) return;
    const oldIdx = gridItems.findIndex((it) => it.id === dragId);
    const newIdx = gridItems.findIndex((it) => it.id === overId);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(gridItems, oldIdx, newIdx);
    onReorderGroupItems(
      activeGroup,
      reordered.map((it) => ({ id: it.id, type: it.kind, x: null, y: null })),
    );
  };

  const onDragCancel = () => {
    setActiveId(null);
    clearHoverSwitchTimer();
    // 实时预览状态下取消拖拽：把视图切回源分类、丢弃预览。
    if (pendingGroupOverride) {
      const fromGroup = pendingGroupOverride.fromGroupId;
      setPendingGroupOverride(null);
      if (fromGroup && fromGroup !== activeGroup) setActiveGroup(fromGroup);
    }
    clearGroupTarget();
    clearMergeTarget();
  };

  const activeItem = activeId ? gridItems.find((it) => it.id === activeId) ?? null : null;

  // ----- 单个 grid item 的内容 -----
  const renderItemContent = (item: Item) => {
    if (item.kind === "widget") {
      const w = item.widget;
      const r = WIDGET_REGISTRY[w.widget];
      if (!r) {
        return (
          <div className="widget-slot widget-invalid" data-nav-item-id={w.id} data-nav-item-type="widget">
            无效小组件
          </div>
        );
      }
      const canExpand = !!r.renderDetail && !!onExpandWidget;
      return (
        <div
          className={"widget-slot" + (canExpand ? " expandable" : "")}
          data-nav-item-id={w.id}
          data-nav-item-type="widget"
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onCtxTile(e, w); }}
        >
          <div
            className="widget-content"
            onClick={
              canExpand
                ? (e) => {
                    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, [data-nobubble]")) return;
                    onExpandWidget!(w);
                  }
                : undefined
            }
          >
            {r.render(w)}
          </div>
        </div>
      );
    }
    const ic = item.icon;
    return (
      <div
        className={"icon-cell-inner" + (newIconIds.has(ic.id) ? " icon-pop" : "")}
        data-nav-item-id={ic.id}
        data-nav-item-type="icon"
        data-nav-item-folder={ic.isFolder ? "true" : undefined}
      >
        <IconTile
          icon={ic}
          onClick={(e, x) => onOpenIcon(e as React.MouseEvent, x)}
          onContext={(e, x) => onCtxTile(e, x)}
        />
      </div>
    );
  };

  return (
    <div
      className="content nav-content"
      ref={contentRef}
      onWheel={onWheel}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("application/x-navhub-item") ||
          e.dataTransfer.types.includes("application/x-folder-item")
        ) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        try {
          const dataStr = e.dataTransfer.getData("application/x-navhub-item");
          if (!dataStr) return;
          const data = JSON.parse(dataStr);
          if (data.type === "folder-item" && data.folderId && onExtractFolderItem) {
            e.preventDefault();
            onExtractFolderItem(data.folderId, data.id);
          }
        } catch (err) {
          console.error("Drop extraction error:", err);
        }
      }}
    >
      <div
        className={
          "nav-area" +
          (slideDir === 1 ? " slide-in-up" : slideDir === -1 ? " slide-in-down" : "")
        }
        style={{
          maxWidth:
            tweaks.iconAreaWidth === 0 || tweaks.iconAreaWidth === undefined
              ? "100%"
              : tweaks.iconAreaWidth,
        }}
      >
        {/* 顶部保留区：永远渲染，用 min-height 把搜索条空间撑开。
            分类内即使没有搜索小组件，这块区域也是空白保留，不允许图标进入。 */}
        <div className={"nav-top-reserve" + (floatingBars.length > 0 ? " has-bar" : "")}>
          {floatingBars.map((fb) => {
            const r = WIDGET_REGISTRY[fb.widget];
            if (!r) return null;
            return (
              <div
                key={fb.id}
                className="floating-bar-slot"
                data-nav-item-id={fb.id}
                data-nav-item-type="widget"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCtxTile(e, fb);
                }}
              >
                {r.render(fb)}
              </div>
            );
          })}
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={gridItems.map((it) => it.id)} strategy={rectSortingStrategy}>
            <div className="nav-grid">
              {gridItems.map((item) => (
                <SortableCell key={item.id} item={item}>
                  {renderItemContent(item)}
                </SortableCell>
              ))}
              {!tweaks.hideAddIcon && (
                <button
                  type="button"
                  className="nav-cell w-1 h-1 nav-add-cell"
                  onClick={(e) => onAddClick(e)}
                >
                  <span className="nav-add-square">
                    <Icon name="plus" size={28} />
                  </span>
                  <span className="nav-add-label">添加</span>
                </button>
              )}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeItem ? (
              <div className={`nav-cell w-${activeItem.span.w} h-${activeItem.span.h} nav-drag-preview`}>
                {renderItemContent(activeItem)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
};

const SortableCell = ({
  item,
  children,
}: {
  item: Item;
  children: React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`nav-cell w-${item.span.w} h-${item.span.h}` + (isDragging ? " is-dragging" : "")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};
