import React, { useEffect, useRef, useState, useMemo } from "react";
import { IconView, WidgetView, Tweaks, GroupView } from "../types";
import { IconTile } from "./IconTile";
import { WIDGET_REGISTRY } from "../widgets";
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
}) => {
  const [slideDir, setSlideDir] = useState(0);
  const [meshUnit, setMeshUnit] = useState(24);
  const [dynamicCols, setDynamicCols] = useState(32);
  const [maxRows, setMaxRows] = useState(64);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let w = entry.contentRect.width;
        let h = entry.contentRect.height;
        // Rigorous geometry sync with 16px standard margins
        const M = 16;
        const X = 24; // Base physical layout block width. wSpan=2 means 64px physical bounding box.
        
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

  const currentIcons = useMemo(() => icons.filter(i => i.groupId === activeGroup), [icons, activeGroup]);
  const currentWidgets = useMemo(() => widgets.filter(w => w.groupId === activeGroup), [widgets, activeGroup]);

  const cols = dynamicCols;

  const wSpanFor = (icon: IconView, colsMax: number) => {
    if (icon.isFolder) {
      if (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg") return Math.min(4, colsMax);
      return Math.min(4, colsMax);
    }
    if (icon.size === "lg" || icon.size === "pill-size") return Math.min(4, colsMax);
    return Math.min(2, colsMax);
  };

  const hSpanFor = (icon: IconView) => {
    if (icon.isFolder && (icon.size === "lg-4" || icon.size === "lg-9" || icon.size === "lg")) return 4;
    if (icon.isFolder) return 4; // Folders are all 4x4 now.
    if (!icon.isFolder && icon.size === "lg") return 4;
    if (icon.size === "pill-size") return 2;
    return 3;
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

    const unplaced: any[] = [];
    
    combined.forEach(obj => {
      const isWidget = obj.type === 'widget';
      const wSpan = isWidget ? Math.min((obj.item as WidgetView).wSpan || ((WIDGET_REGISTRY[(obj.item as WidgetView).widget]?.span || 1) * 2), cols) : wSpanFor(obj.item as IconView, cols);
      const hSpan = isWidget ? ((obj.item as WidgetView).wRow || ((WIDGET_REGISTRY[(obj.item as WidgetView).widget]?.row || 1) * 2)) : hSpanFor(obj.item as IconView);
      
      let gX = obj.item.gridX;
      let gY = obj.item.gridY;
      
      // Auto-recover items floating below the screen height
      if (gY !== null && (gY + hSpan > maxRows || gY < 0)) {
        gY = null;
        gX = null;
      }
      
      if (gX !== null && gY !== null && isFree(gX, gY, wSpan, hSpan)) {
        l.push({ i: obj.item.id, x: gX, y: gY, w: wSpan, h: hSpan });
        markOccupied(gX, gY, wSpan, hSpan);
      } else {
        unplaced.push({ id: obj.item.id, wSpan, hSpan });
      }
    });

    unplaced.forEach(u => {
      let foundX = 0, foundY = 0, placed = false;
      for (let testY = 0; testY <= maxRows - u.hSpan; testY++) {
        for (let testX = 0; testX <= cols - u.wSpan; testX++) {
          if (isFree(testX, testY, u.wSpan, u.hSpan)) {
            foundX = testX; foundY = testY; placed = true; break;
          }
        }
        if (placed) break;
      }
      l.push({ i: u.id, x: foundX, y: foundY, w: u.wSpan, h: u.hSpan });
      markOccupied(foundX, foundY, u.wSpan, u.hSpan);
    });

    if (!tweaks.hideAddIcon) {
      let foundX = 0, foundY = 0, placed = false;
      for (let testY = 0; testY <= maxRows - 2; testY++) {
        for (let testX = 0; testX <= cols - 2; testX++) {
          if (isFree(testX, testY, 2, 2)) {
            foundX = testX; foundY = testY; placed = true; break;
          }
        }
        if(placed) break;
      }
      l.push({ i: "__add_btn", x: foundX, y: foundY, w: 2, h: 2, isDraggable: false });
    }

    return l;
  }, [currentIcons, currentWidgets, cols, tweaks.hideAddIcon]);

  const mergeTargetRef = useRef<string | null>(null);
  const mergeTargetElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);

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
    
    const draggedType = element.dataset.navItemType;
    if (draggedType !== "icon") return; // we only merge icons

    const px = mouseEvent.clientX;
    const py = mouseEvent.clientY;

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
        mergeTargetElRef.current.style.transition = "transform 0.2s, box-shadow 0.2s";
        mergeTargetElRef.current.style.transform = "scale(1.05)";
        mergeTargetElRef.current.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.4)";
        mergeTargetElRef.current.style.borderRadius = "20px";
      }
    } else {
      clearMergeTarget();
    }
  };

  const handleDragStop = (ly: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | null) => {
    setTimeout(() => { isDraggingRef.current = false; }, 100);
    if (mergeTargetRef.current && newItem) {
      console.log("MERGE TRIGGERED", newItem.i, "->", mergeTargetRef.current);
      onMergeIcon(newItem.i, mergeTargetRef.current);
      clearMergeTarget();
      return; 
    }
    clearMergeTarget();
  };

  const handleLayoutChange = (newLayout: Layout) => {
    // Only fire if the user actually moved something (so we don't spam the API on load if not needed)
    // Actually, RGL fires this on mount if the layout collides and it auto-fixes it. 
    // Wait, let's just send the update to the backend. We map them back to icons / widgets.
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
            console.log("EXTRACT FOLDER ITEM", data.id);
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
          margin={[16, 16]} 
          maxRows={maxRows}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          onLayoutChange={handleLayoutChange}
          compactType={null} // allows items to be placed anywhere without auto-packing! 随意留白!
          preventCollision={true} // prevents pushing or overlapping other grid items
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
            const canExpand = !!r.renderDetail && !!onExpandWidget;
            return (
              <div key={w.id}
                data-nav-item-id={w.id}
                data-nav-item-type="widget"
                className={"widget-slot" + (canExpand ? " expandable" : "")}
              >
                <div style={{width:'100%', height:'100%'}}
                  onClick={canExpand ? (e) => {
                    if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                    if ((e.target as HTMLElement).closest('a, button, input, textarea, select, [data-nobubble]')) return;
                    onExpandWidget!(w);
                  } : undefined}
                  onContextMenu={(e => { e.preventDefault(); e.stopPropagation(); onCtxTile(e, w); })}>
                  {r.render(w)}
                  {canExpand && <span className="widget-expand-hint" aria-hidden><Icon name="maximize" size={11} /></span>}
                </div>
              </div>
            );
          })}
          {currentIcons.map(it => (
            <div key={it.id}
              data-nav-item-id={it.id}
              data-nav-item-type="icon"
            >
              <div style={{width:'100%', height:'100%', cursor:'grab'}} className="icon-rgl-wrapper">
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
              <div className="tile sq cursor-pointer" onClick={onAddClick} style={{width:'100%', height:'100%'}}>
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
