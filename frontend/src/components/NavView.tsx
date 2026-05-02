import React, { useEffect, useRef, useState, useMemo } from "react";
import { IconView, WidgetView, Tweaks, GroupView } from "../types";
import { IconTile } from "./IconTile";
import { WIDGET_REGISTRY, WIDGET_SIZE_DIMENSIONS, snapWidgetSize } from "../widgets";
import { Icon } from "./Icon";
import { Layout, LayoutItem } from "react-grid-layout";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

type CombinedItem = {
  type: "icon" | "widget";
  id: string;
  item: IconView | WidgetView;
  sortOrder: number;
};

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
  onMoveAddBtn,
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
  onReorderGroupItems: (groupId: string, items: { id: string; type: "icon" | "widget"; x: number | null; y: number | null }[]) => void;
  onMergeIcon: (dragId: string, targetId: string) => void;
  onMoveGroupItem?: (itemType: "icon" | "widget", itemId: string, targetGroupId: string, targetIndex: number) => void;
  onExpandWidget?: (w: WidgetView) => void;
  onExtractFolderItem?: (folderId: string, itemId: string) => void;
  onMoveAddBtn?: (groupId: string, x: number, y: number) => void;
}) => {
  const [slideDir, setSlideDir] = useState(0);
  const [meshUnit, setMeshUnit] = useState(24);
  const [dynamicCols, setDynamicCols] = useState(32);
  const [maxRows, setMaxRows] = useState(64);
  const [newIconIds, setNewIconIds] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const prevActiveGroupRef = useRef<string | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIconIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let w = entry.contentRect.width;
        let h = entry.contentRect.height;
        // Rigorous geometry sync with 24px standard margins (1.5× of legacy 16px)
        const M = 24;
        const X = 36; // Base physical layout block width. wSpan=2 means 96px physical bounding box at M=24.
        
        // Automatically calculate maximal stable columns to completely disregard broken legacy cached gridCols.
        const colsOptimal = Math.floor((w + M) / (X + M));
        setDynamicCols(colsOptimal);
        setMeshUnit(X);
        
        // Exact height calculation for iPad-like absolute bounding
        const vRows = Math.floor((h + M) / (X + M));
        setMaxRows(Math.max(vRows, 4));
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [tweaks.gridCols]);

  // Unified slide animation: fires for BOTH sidebar clicks and wheel scroll
  useEffect(() => {
    const prevId = prevActiveGroupRef.current;
    prevActiveGroupRef.current = activeGroup;
    if (prevId === null || prevId === activeGroup) return;
    const prevIdx = groups.findIndex(g => g.id === prevId);
    const nextIdx = groups.findIndex(g => g.id === activeGroup);
    if (prevIdx === -1 || nextIdx === -1) return;
    const dir = nextIdx > prevIdx ? 1 : -1;
    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
    setSlideDir(dir);
    slideTimerRef.current = setTimeout(() => setSlideDir(0), 380);
  }, [activeGroup]);

  const wheelLockRef = useRef(0);
  const wheelAccumRef = useRef(0);

  const onWheel = (e: React.WheelEvent) => {
    if (tweaks.wheelPage === false) return;
    const ay = Math.abs(e.deltaY), ax = Math.abs(e.deltaX);
    if (ay < ax) return;

    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return;
      el = el.parentElement;
    }
    const now = Date.now();
    if (now < wheelLockRef.current) return;
    wheelAccumRef.current += e.deltaY;
    const threshold = tweaks.wheelSensitivity ?? 40;
    if (Math.abs(wheelAccumRef.current) < threshold) return;
    const dir = wheelAccumRef.current > 0 ? 1 : -1;
    const idx = groups.findIndex(g => g.id === activeGroup);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= groups.length) {
      wheelAccumRef.current = 0;
      wheelLockRef.current = now + 150;
      return;
    }
    wheelAccumRef.current = 0;
    wheelLockRef.current = now + 520;
    // slideDir is now set by the useEffect above; just change the group
    setActiveGroup(groups[nextIdx].id);
  };

  const currentIcons = useMemo(() => icons.filter(i => i.groupId === activeGroup), [icons, activeGroup]);
  const currentWidgets = useMemo(() => widgets.filter(w => w.groupId === activeGroup), [widgets, activeGroup]);

  // Pop-in animation for newly added or extracted icons
  useEffect(() => {
    const currentIds = new Set(currentIcons.map(i => i.id));
    const added: string[] = [];
    currentIds.forEach(id => { if (!prevIconIdsRef.current.has(id)) added.push(id); });
    prevIconIdsRef.current = currentIds;
    if (added.length === 0) return;
    setNewIconIds(new Set(added));
    const t = setTimeout(() => setNewIconIds(new Set()), 400);
    return () => clearTimeout(t);
  }, [currentIcons]);

  const cols = dynamicCols;

  const wSpanFor = (icon: IconView, colsMax: number) => {
    if (icon.isFolder) {
      if (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg") return Math.min(4, colsMax);
      return Math.min(4, colsMax);
    }
    if (icon.size === "lg" || icon.size === "pill-size") return Math.min(4, colsMax);
    return Math.min(2, colsMax); // sq / circle-size: 2 cols = 88px
  };

  const hSpanFor = (icon: IconView) => {
    if (icon.isFolder && (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg")) return 4;
    if (icon.isFolder) return 4;
    if (!icon.isFolder && icon.size === "lg") return 4;
    if (icon.size === "pill-size") return 2;
    return 3; // sq / circle-size: 3 rows = 140px
  };

  // Convert current icons and widgets into react-grid-layout structure
  const layout: LayoutItem[] = useMemo(() => {
    const l: LayoutItem[] = [];

    const combined: { type: 'widget' | 'icon', item: any, sortOrder: number }[] = [
      ...currentWidgets.map(w => ({ type: 'widget' as const, item: w, sortOrder: w.sortOrder })),
      ...currentIcons.map(ic => ({ type: 'icon' as const, item: ic, sortOrder: ic.sortOrder }))
    ].sort((a,b) => a.sortOrder - b.sortOrder);
    
    const occupied = new Set<string>();
    const isFree = (tryX: number, tryY: number, w: number, h: number) => {
      if (tryX + w > cols) return false;
      for (let x = tryX; x < tryX + w; x++) {
        for (let y = tryY; y < tryY + h; y++) {
          if (occupied.has(`${x},${y}`)) return false;
        }
      }
      return true;
    };
    const markOccupied = (x: number, y: number, w: number, h: number) => {
      for (let ix = x; ix < x + w; ix++) {
        for (let iy = y; iy < y + h; iy++) {
          occupied.add(`${ix},${iy}`);
        }
      }
    };

    // Row-major index just past the last placed item — new items default to "after all elements"
    let lastEndIdx = 0;
    const trackEnd = (x: number, y: number, w: number, h: number) => {
      const endIdx = (y + h - 1) * cols + (x + w - 1) + 1;
      if (endIdx > lastEndIdx) lastEndIdx = endIdx;
    };

    const placeAfterLast = (wSpan: number, hSpan: number) => {
      for (let idx = lastEndIdx; idx < maxRows * cols; idx++) {
        const tx = idx % cols;
        const ty = Math.floor(idx / cols);
        if (tx + wSpan > cols) continue;
        if (ty + hSpan > maxRows) return null;
        if (isFree(tx, ty, wSpan, hSpan)) return { x: tx, y: ty };
      }
      return null;
    };
    const placeAnywhere = (wSpan: number, hSpan: number) => {
      for (let testY = 0; testY <= maxRows - hSpan; testY++) {
        for (let testX = 0; testX <= cols - wSpan; testX++) {
          if (isFree(testX, testY, wSpan, hSpan)) return { x: testX, y: testY };
        }
      }
      return null;
    };

    const unplaced: any[] = [];

    combined.forEach(obj => {
      const isWidget = obj.type === 'widget';
      let wSpan: number;
      let hSpan: number;
      if (isWidget) {
        const widgetItem = obj.item as WidgetView;
        const reg = WIDGET_REGISTRY[widgetItem.widget];
        if (reg?.floatingBar) {
          // 悬浮条组件：横跨全部列，高度固定 3 行
          wSpan = cols;
          hSpan = 3;
        } else {
          const sizeKey = snapWidgetSize(widgetItem.wSpan, widgetItem.wRow) || reg?.defaultSize || "medium";
          const dim = WIDGET_SIZE_DIMENSIONS[sizeKey];
          wSpan = Math.min(dim.wSpan, cols);
          hSpan = dim.wRow;
        }
      } else {
        wSpan = wSpanFor(obj.item as IconView, cols);
        hSpan = hSpanFor(obj.item as IconView);
      }

      const isFloatingBar = obj.type === 'widget'
        && WIDGET_REGISTRY[(obj.item as WidgetView).widget]?.floatingBar === true;

      let gX = isFloatingBar ? 0 : obj.item.gridX;
      let gY = obj.item.gridY;

      // Auto-recover items floating below the screen height
      if (gY !== null && (gY + hSpan > maxRows || gY < 0)) {
        gY = null;
        gX = null;
      }

      const extraProps = isFloatingBar ? { isDraggable: false } : {};

      if (gX !== null && gY !== null && isFree(gX, gY, wSpan, hSpan)) {
        l.push({ i: obj.item.id, x: gX, y: gY, w: wSpan, h: hSpan, ...extraProps });
        markOccupied(gX, gY, wSpan, hSpan);
        trackEnd(gX, gY, wSpan, hSpan);
      } else {
        unplaced.push({ id: obj.item.id, wSpan, hSpan, extraProps, origX: gX, origY: gY });
      }
    });

    // Reserve the add button's pinned slot (if any) so unplaced items don't land on it.
    let reservedAddPos: { x: number; y: number } | null = null;
    if (!tweaks.hideAddIcon) {
      const saved = tweaks.addBtnPositions?.[activeGroup];
      if (saved
        && typeof saved.x === 'number' && typeof saved.y === 'number'
        && saved.x >= 0 && saved.y >= 0
        && saved.x + 2 <= cols && saved.y + 3 <= maxRows
        && isFree(saved.x, saved.y, 2, 3)) {
        reservedAddPos = { x: saved.x, y: saved.y };
        markOccupied(saved.x, saved.y, 2, 3);
      }
    }

    unplaced.forEach(u => {
      // 兜底顺序：列表末尾 → 任意空位 → 保留原 (gridX, gridY)（即使会重叠，也好过强制粘到左上角）
      const pos = placeAfterLast(u.wSpan, u.hSpan)
        ?? placeAnywhere(u.wSpan, u.hSpan)
        ?? (u.origX !== null && u.origY !== null ? { x: u.origX, y: u.origY } : { x: 0, y: 0 });
      l.push({ i: u.id, x: pos.x, y: pos.y, w: u.wSpan, h: u.hSpan, ...(u.extraProps || {}) });
      markOccupied(pos.x, pos.y, u.wSpan, u.hSpan);
      trackEnd(pos.x, pos.y, u.wSpan, u.hSpan);
    });

    if (!tweaks.hideAddIcon) {
      const pos = reservedAddPos
        ?? placeAfterLast(2, 3)
        ?? placeAnywhere(2, 3)
        ?? { x: 0, y: Math.max(0, maxRows - 3) };
      l.push({ i: "__add_btn", x: pos.x, y: pos.y, w: 2, h: 3 });
      // (reserved positions are already marked occupied)
      if (!reservedAddPos) markOccupied(pos.x, pos.y, 2, 3);
    }

    return l;
  }, [currentIcons, currentWidgets, cols, maxRows, tweaks.hideAddIcon, tweaks.addBtnPositions, activeGroup]);

  const mergeTargetRef = useRef<string | null>(null);
  const mergeTargetElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragGroupTargetRef = useRef<string | null>(null);
  const dragGroupTargetElRef = useRef<HTMLElement | null>(null);
  const skipNextLayoutChangeRef = useRef(false);
  /** 时间戳：在该时间之前发生的 layoutChange 不发 reorder 请求。
   *  跨分类拖拽落地、活动分类切换都会触发多次重渲染，单次 skip 标志兜不住，
   *  这里用一个时间窗口统一吸收所有 spurious 的 layoutChange，避免请求风暴 + 后端死锁。 */
  const suppressReorderUntilRef = useRef<number>(0);

  // 切换活动分类时短暂抑制 reorder：layout 重算会触发 layoutChange，但实际上没有用户操作。
  useEffect(() => {
    suppressReorderUntilRef.current = Date.now() + 400;
  }, [activeGroup]);

  const clearGroupTarget = () => {
    if (dragGroupTargetElRef.current) {
      dragGroupTargetElRef.current.classList.remove("drag-group-target");
      dragGroupTargetElRef.current = null;
    }
    dragGroupTargetRef.current = null;
  };

  const clearMergeTarget = () => {
    if (mergeTargetElRef.current) {
      mergeTargetElRef.current.classList.remove("merge-target-glow");
      mergeTargetElRef.current.style.transform = "scale(1)";
      mergeTargetElRef.current.style.boxShadow = "none";
      mergeTargetElRef.current = null;
    }
    mergeTargetRef.current = null;
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDrag = (ly: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | null) => {
    const mouseEvent = e as MouseEvent;
    if (!mouseEvent || !mouseEvent.clientX || !element) return;

    const px = mouseEvent.clientX;
    const py = mouseEvent.clientY;

    // Check if cursor is over a sidebar group button (cross-category drag).
    const groupBtns = document.querySelectorAll<HTMLElement>('.side-btn.cat[data-group-id]');
    let foundGroupEl: HTMLElement | null = null;
    let foundGroupId: string | null = null;
    for (const btn of groupBtns) {
      const r = btn.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        foundGroupEl = btn;
        foundGroupId = btn.dataset.groupId!;
        break;
      }
    }

    if (foundGroupEl && foundGroupId && foundGroupId !== activeGroup) {
      if (dragGroupTargetRef.current !== foundGroupId) {
        clearGroupTarget();
        clearMergeTarget();
        dragGroupTargetRef.current = foundGroupId;
        dragGroupTargetElRef.current = foundGroupEl;
        foundGroupEl.classList.add("drag-group-target");
      }
      return; // sidebar target takes priority — skip merge logic
    }
    clearGroupTarget();

    const draggedType = element.dataset.navItemType;
    if (draggedType !== "icon") return; // we only merge icons

    let foundTarget: HTMLElement | null = null;
    const iconEls = document.querySelectorAll('[data-nav-item-type="icon"]:not(.react-grid-placeholder)');
    for (let i = 0; i < iconEls.length; i++) {
        const el = iconEls[i] as HTMLElement;
        const id = el.dataset.navItemId;
        if (!id || id === newItem?.i) continue; // skip self

        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        if (Math.abs(px - cx) < rect.width * 0.25 && Math.abs(py - cy) < rect.height * 0.25) {
            foundTarget = el;
            break;
        }
    }

    if (foundTarget) {
      const relatedId = foundTarget.dataset.navItemId!;
      if (mergeTargetRef.current !== relatedId) {
        clearMergeTarget();
        mergeTargetRef.current = relatedId;
        mergeTargetElRef.current = foundTarget;
        mergeTargetElRef.current.classList.add("merge-target-glow");
        mergeTargetElRef.current.style.transition = "transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s";
        mergeTargetElRef.current.style.transform = "scale(1.06)";
        mergeTargetElRef.current.style.boxShadow = "0 0 0 3px rgba(255,215,165,0.75), 0 0 20px rgba(255,215,165,0.35)";
        mergeTargetElRef.current.style.borderRadius = "22px";
      }
    } else {
      clearMergeTarget();
    }
  };

  const handleDragStop = (ly: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | null) => {
    setTimeout(() => { isDraggingRef.current = false; }, 100);

    // Add-icon button drag: persist the new position for this group.
    if (newItem?.i === "__add_btn") {
      clearGroupTarget();
      clearMergeTarget();
      skipNextLayoutChangeRef.current = true;
      onMoveAddBtn?.(activeGroup, newItem.x, newItem.y);
      return;
    }

    // Cross-category drop: move item to the hovered sidebar group.
    if (dragGroupTargetRef.current && newItem) {
      const targetGroupId = dragGroupTargetRef.current;
      const draggedItemType = element?.dataset.navItemType as "icon" | "widget" | undefined;
      const targetEl = dragGroupTargetElRef.current;
      clearGroupTarget();
      clearMergeTarget();
      // onMoveGroupItem 内部会发 PATCH /icons + POST /reorder-items，乐观更新会触发 layout 重算；
      // 紧接着 setActiveGroup 又会触发一次重算。开一个 1s 的抑制窗口吸收掉所有 spurious 的
      // layoutChange，避免短时间内对同一个 group 连发多个 reorder 请求引起后端死锁。
      suppressReorderUntilRef.current = Date.now() + 1000;
      skipNextLayoutChangeRef.current = true;
      if (draggedItemType) {
        onMoveGroupItem?.(draggedItemType, newItem.i, targetGroupId, 0);
        // 命中的分类按钮做一次接收脉冲
        if (targetEl) {
          targetEl.classList.add("group-receive-pulse");
          window.setTimeout(() => targetEl.classList.remove("group-receive-pulse"), 520);
        }
        // 切到目标分类：updateIcon/updateWidget 已乐观更新本地状态，
        // 新分类里能立刻看到刚搬过去的元素，便于继续调整位置。
        if (targetGroupId !== activeGroup) setActiveGroup(targetGroupId);
      }
      return;
    }

    if (mergeTargetRef.current && newItem) {
      const targetEl = mergeTargetElRef.current;
      const targetId = mergeTargetRef.current;
      // Detach refs immediately so clearMergeTarget won't reset the animation mid-play
      mergeTargetRef.current = null;
      mergeTargetElRef.current = null;
      if (targetEl) {
        targetEl.classList.remove("merge-target-glow");
        targetEl.style.transition = "";
        targetEl.style.transform = "";
        targetEl.style.boxShadow = "";
        targetEl.classList.add("merge-absorb");
      }
      setTimeout(() => {
        onMergeIcon(newItem.i, targetId);
        targetEl?.classList.remove("merge-absorb");
      }, 280);
      return;
    }
    clearMergeTarget();

    // 横向 swap：preventCollision=false 时 RGL 会把被压到的元素往「下」挤，
    // 这通常不是用户期望的（截图就是这样）。如果落点造成位移，我们用「把
    // 被位移的元素挪到 A 原位置」的 swap 替代，体验上就像「往旁边让位」。
    if (newItem && oldItem && (oldItem.x !== newItem.x || oldItem.y !== newItem.y)) {
      // 找出在这次拖拽里 gridX/gridY 发生变化的其他元素（即被 RGL 推走的）
      const findOrig = (id: string) =>
        currentIcons.find((ic) => ic.id === id) ?? currentWidgets.find((w) => w.id === id);
      const displaced = ly.filter((it) => {
        if (it.i === newItem.i || it.i === "__add_btn") return false;
        const orig = findOrig(it.i);
        if (!orig || orig.gridX === null || orig.gridY === null) return false;
        return orig.gridX !== it.x || orig.gridY !== it.y;
      });
      if (displaced.length > 0) {
        // 候选 swap 布局：把所有被位移的元素全部还原到原位置，
        // 再让 newItem 落在它现在被分配到的位置；最常见的 1↔1 swap：
        // 被位移的那个去 A 的原位置，A 去它原本的位置。
        const adjusted: LayoutItem[] = ly.map((it) => {
          if (it.i === newItem.i || it.i === "__add_btn") return it;
          const orig = findOrig(it.i);
          if (orig && orig.gridX !== null && orig.gridY !== null) {
            return { ...it, x: orig.gridX, y: orig.gridY };
          }
          return it;
        });
        // 把第一个被位移的元素挪到 A 原位置（swap）
        const head = displaced[0];
        const swapLayout = adjusted.map((it) =>
          it.i === head.i ? { ...it, x: oldItem.x, y: oldItem.y } : it,
        );
        // 校验 swap 后无重叠且都在 maxRows 内
        const overlapOk = (() => {
          for (let i = 0; i < swapLayout.length; i++) {
            const a = swapLayout[i];
            if (a.i === "__add_btn") continue;
            if (a.y + a.h > maxRows || a.x + a.w > cols || a.x < 0 || a.y < 0) return false;
            for (let j = i + 1; j < swapLayout.length; j++) {
              const b = swapLayout[j];
              if (b.i === "__add_btn") continue;
              if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
            }
          }
          return true;
        })();
        if (overlapOk) {
          // 直接走 reorder，handleLayoutChange 不必再处理这次 layout
          skipNextLayoutChangeRef.current = true;
          const res = swapLayout
            .filter((it) => it.i !== "__add_btn")
            .map((it) => ({
              id: it.i,
              type: currentIcons.some((ic) => ic.id === it.i) ? ("icon" as const) : ("widget" as const),
              x: it.x,
              y: it.y,
            }));
          onReorderGroupItems(activeGroup, res);
        }
        // 校验失败时，让 handleLayoutChange 按原样处理（垂直推或拒绝）
      }
    }
  };

  const handleLayoutChange = (newLayout: Layout) => {
    if (skipNextLayoutChangeRef.current) { skipNextLayoutChangeRef.current = false; return; }
    // 处于抑制窗口（跨分类移动 / 切换分类导致的重渲染）时直接忽略，
    // 否则会出现一次拖拽放大成多个 reorder 请求并发，引发后端死锁。
    if (Date.now() < suppressReorderUntilRef.current) return;

    // 防御：极少数情况下 RGL 在 compactType=null 时无法找到合适位置安置被挤开的
    // 图标，会给出一个仍带重叠的 layout。这种 layout 一旦写回，下一帧布局重算
    // 会让被挤的图标走到 placeAfterLast/placeAnywhere 兜底，可能塌到左上角。
    // 直接丢弃该次 layoutChange，RGL 下一帧按 props 回弹到原位置。
    for (let i = 0; i < newLayout.length; i++) {
      const a = newLayout[i];
      if (a.i === "__add_btn") continue;
      for (let j = i + 1; j < newLayout.length; j++) {
        const b = newLayout[j];
        if (b.i === "__add_btn") continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w
                     && a.y < b.y + b.h && b.y < a.y + a.h;
        if (overlap) return;
      }
    }
    const res: { id: string, type: "icon" | "widget", x: number, y: number }[] = [];
    
    // Check if anything actually changed physically relative to current state
    let changed = false;

    newLayout.forEach(ly => {
      const isWidget = currentWidgets.some(w => w.id === ly.i);
      const isIcon = currentIcons.some(ic => ic.id === ly.i);
      if (isWidget) {
        const w = currentWidgets.find(w => w.id === ly.i)!;
        if (w.gridX !== ly.x || w.gridY !== ly.y) changed = true;
        res.push({ id: ly.i, type: "widget", x: ly.x, y: ly.y });
      } else if (isIcon) {
        const ic = currentIcons.find(ic => ic.id === ly.i)!;
        if (ic.gridX !== ly.x || ic.gridY !== ly.y) changed = true;
        res.push({ id: ly.i, type: "icon", x: ly.x, y: ly.y });
      }
    });

    if (changed) {
      onReorderGroupItems(activeGroup, res);
    }
  };

  return (
    <div className="content" ref={contentRef} onWheel={onWheel}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-navhub-item") || e.dataTransfer.types.includes("application/x-folder-item")) {
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
      <div style={{ maxWidth: (tweaks.iconAreaWidth === 0 || tweaks.iconAreaWidth === undefined) ? '100%' : tweaks.iconAreaWidth, width: '100%', height: '100%', margin: '0 auto', position: 'relative' }} className={slideDir === 1 ? "slide-in-up" : slideDir === -1 ? "slide-in-down" : ""}>
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: cols, md: cols, sm: cols, xs: cols, xxs: cols }}
          rowHeight={meshUnit}
          margin={[24, 24]}
          maxRows={maxRows}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          onLayoutChange={handleLayoutChange}
          compactType={null} // 允许在任意网格位置放置，不做自动堆叠
          preventCollision={false} // 让 A 能落到 B 的位置；RGL 默认会把 B 往下推，我们在 handleDragStop 里拦截改成横向 swap
          isDroppable={false}
          isBounded={true} // Strict monitor height bound
          isResizable={false} // We don't need drag-to-resize visually for now since w/h is tied to data size param
          useCSSTransforms={true}
        >
          {currentWidgets.map(w => {
            const r = WIDGET_REGISTRY[w.widget];
            if (!r) return (
              <div key={w.id} data-nav-item-id={w.id} data-nav-item-type="widget" className="widget-slot not-drag" style={{ padding: 8, color: "red", fontSize: 12 }}>
                无效小组件
              </div>
            );
            const canExpand = !!r.renderDetail && !!onExpandWidget && !r.floatingBar;
            return (
              <div key={w.id}
                data-nav-item-id={w.id}
                data-nav-item-type="widget"
                className={"widget-slot" + (canExpand ? " expandable" : "") + (r.floatingBar ? " floating-bar-slot" : "")}
              >
                <div style={{width:'100%', height:'100%'}}
                  onClick={canExpand ? (e) => {
                    if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                    if ((e.target as HTMLElement).closest('a, button, input, textarea, select, [data-nobubble]')) return;
                    onExpandWidget!(w);
                  } : undefined}
                  onContextMenu={(e => { e.preventDefault(); e.stopPropagation(); onCtxTile(e, w); })}>
                  {r.render(w)}
                </div>
              </div>
            );
          })}
          {currentIcons.map(it => (
            <div key={it.id}
              data-nav-item-id={it.id}
              data-nav-item-type="icon"
            >
              <div style={{width:'100%', height:'100%', cursor:'grab'}} className={newIconIds.has(it.id) ? "icon-rgl-wrapper icon-pop" : "icon-rgl-wrapper"}>
                <IconTile
                  icon={it}
                  onClick={(e, ic) => {
                    if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                    onOpenIcon(e as React.MouseEvent, ic);
                  }}
                  onContext={(e, ic) => onCtxTile(e, ic)}
                />
              </div>
            </div>
          ))}
          {!tweaks.hideAddIcon && (
            <div key="__add_btn">
              <div
                className="tile sq cursor-pointer"
                onClick={(e) => {
                  if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                  onAddClick(e);
                }}
                style={{width:'100%', height:'100%'}}
              >
                <div className="tile-icon" style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px dashed rgba(255,255,255,0.3)', boxShadow: 'none' }}><Icon name="plus" size={22} /></div>
                <div className="tile-label" style={{ opacity: 0.7 }}>添加</div>
              </div>
            </div>
          )}
        </ResponsiveGridLayout>
      </div>

    </div>
  );
};
