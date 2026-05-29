import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragOverlay } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GroupView, IconView, Tweaks, WidgetView } from "../types";
import { IconTile } from "./IconTile";
import { Icon } from "./Icon";
import { pickEmptyState } from "../utils/emptyState";
import { shouldUseContentVisibility } from "../utils/navVirtualization";
import {
  shouldShowDragHint,
  readDragHintDismissed,
  persistDragHintDismissed,
} from "../utils/dragHint";
import { WIDGET_REGISTRY } from "../widgets";
import { useI18n } from "../i18n";
import type { NavGridItem, UseNavDndResult } from "../hooks/useNavDnd";

// =================================================================
// NavView：分类下的 icon / widget 网格（展示层）。
//
// 设计原则：
//  • 使用原生 CSS Grid (auto-flow: row dense)；每个元素只通过 sortOrder 决定顺序，
//    位置由浏览器自动计算，不再保存 gridX/gridY。
//  • 搜索条等 floatingBar 小组件单独渲染在网格之上，不参与排序、不可拖。
//  • 拖拽用 @dnd-kit/sortable；松手只更新 sortOrder。
//  • UX-27：跨分类移动、分类内排序、文件夹合并统一在一个 <DndContext> 内完成。
//    DndContext 提升到 Shell 层(同时覆盖侧边栏)，拖拽协调逻辑见 hooks/useNavDnd。
//    NavView 只负责渲染 SortableContext / 网格 / DragOverlay。
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
  onExpandWidget,
  onExtractFolderItem,
  editable = false,
  onAddCategory,
  onAddIcon,
  dnd,
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
  onExpandWidget?: (w: WidgetView) => void;
  onExtractFolderItem?: (folderId: string, itemId: string) => void;
  /** 当前用户能否在当前分类做写操作(非访客 + 分类可编辑)。决定空状态是否给「添加」入口。 */
  editable?: boolean;
  /** 打开「新建分类」弹窗(空工作区时引导)。 */
  onAddCategory?: () => void;
  /** 打开「添加图标」弹窗(空分类时引导)。 */
  onAddIcon?: () => void;
  /** 拖拽协调结果，来自 Shell 层的 useNavDnd(与侧边栏共处同一 DndContext)。 */
  dnd: UseNavDndResult;
}) => {
  const { t } = useI18n();
  const { gridItems, activeItem } = dnd;
  const [slideDir, setSlideDir] = useState(0);
  const [newIconIds, setNewIconIds] = useState<Set<string>>(new Set());
  // UX-19: 拖拽手势首次引导是否已被用户关闭(持久化在 localStorage)。初值从 localStorage 读。
  const [dragHintDismissed, setDragHintDismissed] = useState(() => readDragHintDismissed());
  const dismissDragHint = () => {
    setDragHintDismissed(true);
    persistDragHintDismissed();
  };
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

  // 引导空状态：整个工作区没有分类 / 当前分类没有任何 icon&widget 时,
  // 给一张友好的引导卡片(而不是一片空白)。写操作入口只在 editable 时出现。
  const emptyState = pickEmptyState({
    hasGroups: groups.length > 0,
    hasItems: gridItems.length > 0,
    editable,
  });

  // UX-19: 拖拽手势首次引导。只在「可编辑 + 当前分类有内容 + 用户未关闭」时显示一条可关闭的提示行。
  const showDragHint = shouldShowDragHint({
    editable,
    hasContent: gridItems.length > 0,
    dismissed: dragHintDismissed,
  });

  // PERF-7: 大分类(单元格很多)时给网格加 content-visibility 优化类，让浏览器跳过
  // 离屏单元格的渲染/布局/绘制。DOM 元素仍在 → dnd-kit 注册、碰撞检测、合并几何、
  // 键盘焦点顺序全部不受影响。小网格不加(切换成本无谓)。判定见 navVirtualization.ts。
  const useContentVisibility = shouldUseContentVisibility(gridItems.length);

  // PERF-2: 把来自 Shell 的回调(onOpenIcon/onCtxTile/onExpandWidget,均为内联箭头、
  // 每次 Shell 渲染换引用)镜像进 ref,再用 useCallback([]) 暴露恒稳的包装回调。
  // 这样传给每个磁贴/单元格的 handler 引用永不变,React.memo 的浅比较才真正生效——
  // 拖拽/编辑某一项时,其余项的 props 全等不变,不再重渲染。
  const handlersRef = useRef({ onOpenIcon, onCtxTile, onExpandWidget });
  handlersRef.current = { onOpenIcon, onCtxTile, onExpandWidget };
  const handleOpenIcon = useCallback(
    (e: React.MouseEvent, x: IconView) => handlersRef.current.onOpenIcon(e as React.MouseEvent, x),
    [],
  );
  const handleCtxTile = useCallback(
    (e: React.MouseEvent, item: IconView | WidgetView) => handlersRef.current.onCtxTile(e, item),
    [],
  );
  const handleExpandWidget = useCallback((w: WidgetView) => {
    handlersRef.current.onExpandWidget?.(w);
  }, []);

  const newTab = (tweaks.iconOpen || "newtab") !== "current";
  // 保留原门控:仅当父级提供了 onExpandWidget 时,带 renderDetail 的小组件才「可展开」。
  const widgetsExpandable = !!onExpandWidget;

  // DragOverlay 用的一次性内容渲染(单个、瞬时,不进入 memo 网格,无需稳定化)。
  const renderItemContent = (item: NavGridItem) => (
    <NavCellContent
      item={item}
      newTab={newTab}
      isNew={item.kind === "icon" && newIconIds.has(item.id)}
      widgetsExpandable={widgetsExpandable}
      onOpenIcon={handleOpenIcon}
      onCtxTile={handleCtxTile}
      onExpandWidget={handleExpandWidget}
    />
  );

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
        {showDragHint ? (
          <div className="nav-drag-hint" role="note">
            <span className="nav-drag-hint-icon" aria-hidden="true">
              <Icon name="sparkle" size={16} />
            </span>
            <span className="nav-drag-hint-text">
              <span className="nav-drag-hint-tip">
                <Icon name="grid" size={13} />
                拖动图标可重新排序
              </span>
              <span className="nav-drag-hint-tip">
                <Icon name="folder" size={13} />
                把图标深压到另一张上合并为文件夹
              </span>
              <span className="nav-drag-hint-tip">
                <Icon name="arrow-right" size={13} />
                拖到左侧分类可移动到其他分类
              </span>
              <span className="nav-drag-hint-tip nav-drag-hint-touch">
                <Icon name="info" size={13} />
                触摸屏长按图标再拖动
              </span>
            </span>
            <button
              type="button"
              className="nav-drag-hint-close"
              onClick={dismissDragHint}
              aria-label="不再提示"
              title="不再提示"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}
        <SortableContext items={gridItems.map((it) => it.id)} strategy={rectSortingStrategy}>
          {emptyState ? (
            <div className="nav-empty">
              <div className="nav-empty-glyph">
                <Icon name={emptyState === "no-groups" ? "grid" : "plus"} size={30} />
              </div>
              {emptyState === "no-groups" ? (
                <>
                  <div className="nav-empty-title">{t("nav.empty.noGroupsTitle")}</div>
                  <div className="nav-empty-desc">
                    {editable
                      ? t("nav.empty.noGroupsDescEditable")
                      : t("nav.empty.noGroupsDescReadonly")}
                  </div>
                  {editable && onAddCategory ? (
                    <div className="nav-empty-actions">
                      <button
                        type="button"
                        className="nav-empty-btn primary"
                        onClick={onAddCategory}
                      >
                        <Icon name="plus" size={16} />
                        {t("nav.empty.addFirstGroup")}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="nav-empty-title">{t("nav.empty.noItemsTitle")}</div>
                  <div className="nav-empty-desc">
                    {editable
                      ? t("nav.empty.noItemsDescEditable")
                      : t("nav.empty.noItemsDescReadonly")}
                  </div>
                  {editable && onAddIcon ? (
                    <div className="nav-empty-actions">
                      <button
                        type="button"
                        className="nav-empty-btn primary"
                        onClick={onAddIcon}
                      >
                        <Icon name="plus" size={16} />
                        {t("nav.empty.addFirstIcon")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          <div className={"nav-grid" + (useContentVisibility ? " nav-grid-cv" : "")}>
            {gridItems.map((item) => (
              <NavGridCell
                key={item.id}
                item={item}
                newTab={newTab}
                isNew={item.kind === "icon" && newIconIds.has(item.id)}
                widgetsExpandable={widgetsExpandable}
                onOpenIcon={handleOpenIcon}
                onCtxTile={handleCtxTile}
                onExpandWidget={handleExpandWidget}
              />
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
                <span className="nav-add-label">{t("nav.add")}</span>
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
      </div>
    </div>
  );
};

// PERF-2: 单元格内容(widget 槽 / 图标磁贴)。所有交互回调由父级以恒稳引用传入,
// item 来自 gridItems memo 逐项稳定,newTab/isNew 为基元 —— 故可安全 React.memo,
// 拖拽/编辑某一项时其余单元格 props 全等不变,跳过重渲染。
const NavCellContentImpl = ({
  item,
  newTab,
  isNew,
  widgetsExpandable,
  onOpenIcon,
  onCtxTile,
  onExpandWidget,
}: {
  item: NavGridItem;
  newTab: boolean;
  isNew: boolean;
  widgetsExpandable: boolean;
  onOpenIcon: (e: React.MouseEvent, icon: IconView) => void;
  onCtxTile: (e: React.MouseEvent, item: IconView | WidgetView) => void;
  onExpandWidget: (w: WidgetView) => void;
}) => {
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
    const canExpand = !!r.renderDetail && widgetsExpandable;
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
                  onExpandWidget(w);
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
      className={"icon-cell-inner" + (isNew ? " icon-pop" : "")}
      data-nav-item-id={ic.id}
      data-nav-item-type="icon"
      data-nav-item-folder={ic.isFolder ? "true" : undefined}
    >
      <IconTile
        icon={ic}
        newTab={newTab}
        onClick={onOpenIcon}
        onContext={onCtxTile}
      />
    </div>
  );
};
const NavCellContent = React.memo(NavCellContentImpl);

// PERF-2: 排序单元格(原 SortableCell)。useSortable 的 transform/transition/isDragging
// 只在「本格正被拖拽或正给被拖项让位」时变化,其余格的这些值不变 —— 配合 memo,
// 拖动一项不再触发全网格重渲染。content 交给同样 memo 的 NavCellContent。
const NavGridCellImpl = ({
  item,
  newTab,
  isNew,
  widgetsExpandable,
  onOpenIcon,
  onCtxTile,
  onExpandWidget,
}: {
  item: NavGridItem;
  newTab: boolean;
  isNew: boolean;
  widgetsExpandable: boolean;
  onOpenIcon: (e: React.MouseEvent, icon: IconView) => void;
  onCtxTile: (e: React.MouseEvent, item: IconView | WidgetView) => void;
  onExpandWidget: (w: WidgetView) => void;
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
      <NavCellContent
        item={item}
        newTab={newTab}
        isNew={isNew}
        widgetsExpandable={widgetsExpandable}
        onOpenIcon={onOpenIcon}
        onCtxTile={onCtxTile}
        onExpandWidget={onExpandWidget}
      />
    </div>
  );
};
const NavGridCell = React.memo(NavGridCellImpl);
