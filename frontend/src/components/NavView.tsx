import React, { useEffect, useRef, useState } from "react";
import { IconView, WidgetView, Tweaks, GroupView } from "../types";
import { IconTile } from "./IconTile";
import { WIDGET_REGISTRY } from "../widgets";
import { Icon } from "./Icon";
import { ReactSortable } from "react-sortablejs";

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
  onReorderGroupItems: (groupId: string, items: { id: string; type: "icon" | "widget" }[]) => void;
  onMergeIcon: (dragId: string, targetId: string) => void;
  onMoveGroupItem?: (itemType: "icon" | "widget", itemId: string, targetGroupId: string, targetIndex: number) => void;
  onExpandWidget?: (w: WidgetView) => void;
  onExtractFolderItem?: (folderId: string, itemId: string) => void;
}) => {
  const [slideDir, setSlideDir] = useState(0);

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
    setSlideDir(dir);
    setActiveGroup(groups[nextIdx].id);
    setTimeout(() => setSlideDir(0), 360);
  };

  const currentIcons = React.useMemo(() => icons.filter(i => i.groupId === activeGroup), [icons, activeGroup]);
  const currentWidgets = React.useMemo(() => widgets.filter(w => w.groupId === activeGroup), [widgets, activeGroup]);

  const combinedItems: CombinedItem[] = React.useMemo(() => {
      return [
        ...currentWidgets.map(w => ({ type: 'widget' as const, id: w.id, item: w, sortOrder: w.sortOrder })),
        ...currentIcons.map(i => ({ type: 'icon' as const, id: i.id, item: i, sortOrder: i.sortOrder })),
      ].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [currentIcons, currentWidgets]);

  const [list, setList] = useState<CombinedItem[]>([]);

  useEffect(() => {
    setList(combinedItems);
  }, [combinedItems]);

  const listRef = useRef<CombinedItem[]>([]);
  listRef.current = list;

  const handleSortEnd = () => {
    const currentOrder = listRef.current;
    const originalIds = combinedItems.map(x => x.id).join(',');
    const newIds = currentOrder.map(x => x.id).join(',');
    
    if (originalIds !== newIds) {
      onReorderGroupItems(
        activeGroup,
        currentOrder.map(x => ({ id: x.id, type: x.type }))
      );
    }
  };

  const cols = tweaks.gridCols || 8;

  const spanFor = (icon: IconView, colsMax: number) => {
    if (icon.isFolder) {
      if (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg") return Math.min(2, colsMax);
      return 1;
    }
    if (icon.size === "lg" || icon.size === "pill-size") return Math.min(2, colsMax);
    return 1;
  };

  const rowSpanFor = (icon: IconView) => {
    if (icon.isFolder && (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg")) return 2;
    if (!icon.isFolder && icon.size === "lg") return 2;
    return 1;
  };

  return (
    <div className="content" onWheel={onWheel}>
      <ReactSortable
        list={list}
        setList={setList}
        animation={300}
        delay={150}
        delayOnTouchOnly={true}
        onEnd={handleSortEnd}
        ghostClass="sortable-ghost"
        chosenClass="sortable-chosen"
        dragClass="sortable-drag"
        filter=".not-drag, a, button, input"
        preventOnFilter={false}
        className={"grid " + (slideDir === 1 ? "slide-in-up" : slideDir === -1 ? "slide-in-down" : "")} 
        style={{ 
          gridTemplateColumns: `repeat(${cols}, 1fr)`, 
          gap: '18px 10px', 
          maxWidth: (tweaks.iconAreaWidth || 1200), 
          margin: '0 auto',
          position: 'relative'
        }}
      >
        {list.map((ci) => {
          if (ci.type === 'widget') {
            const w = ci.item as WidgetView;
            const r = WIDGET_REGISTRY[w.widget];
            if (!r) return null;
            const canExpand = !!r.renderDetail && !!onExpandWidget;
            return (
              <div key={w.id}
                data-nav-item-id={w.id}
                data-nav-item-type="widget"
                className={"widget-slot" + (canExpand ? " expandable" : "")}
                style={{ 
                  gridColumn: `span ${Math.min(w.wSpan || r.span || 1, cols)}`, 
                  gridRow: w.wRow ? `span ${w.wRow}` : undefined,
                  cursor: "grab",
                  userSelect: "none"
                }}
                onClick={canExpand ? (e) => {
                  if ((e.target as HTMLElement).closest('a, button, input, textarea, select, [data-nobubble]')) return;
                  onExpandWidget!(w);
                } : undefined}
                onContextMenu={(e => { e.preventDefault(); e.stopPropagation(); onCtxTile(e, w); })}>
                {r.render(w)}
                {canExpand && <span className="widget-expand-hint" aria-hidden><Icon name="maximize" size={11} /></span>}
              </div>
            );
          } else {
            const it = ci.item as IconView;
            return (
              <div key={it.id}
                data-nav-item-id={it.id}
                data-nav-item-type="icon"
                style={{ 
                  gridColumn: `span ${spanFor(it, cols)}`, 
                  gridRow: `span ${rowSpanFor(it)}`,
                  cursor: "grab",
                  userSelect: "none"
                }}
              >
                <IconTile
                  icon={it}
                  onClick={(e, ic) => onOpenIcon(e as React.MouseEvent, ic)}
                  onContext={(e, ic) => onCtxTile(e, ic)}
                />
              </div>
            );
          }
        })}

        {!tweaks.hideAddIcon && (
          <div className="not-drag" style={{ gridColumn: "span 1" }}>
            <div className="tile sq cursor-pointer" onClick={onAddClick}>
              <div className="tile-icon" style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px dashed rgba(255,255,255,0.3)', boxShadow: 'none' }}><Icon name="plus" size={22} /></div>
              <div className="tile-label" style={{ opacity: 0.7 }}>添加</div>
            </div>
          </div>
        )}
      </ReactSortable>
    </div>
  );
};
