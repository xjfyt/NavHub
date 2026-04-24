import React, { useEffect, useMemo, useState } from "react";
import {
  DEMO_CONFIG,
  WIDGET_KINDS,
  WIDGET_REGISTRY,
  WIDGET_SIZE_DIMENSIONS,
  WIDGET_SIZE_LABEL,
  WIDGET_SIZE_ORDER,
  type WidgetSizeId,
} from "../widgets";
import { PREVIEW_WIDGET_ID } from "../widgets/types";
import { Icon } from "./Icon";
import { GroupView, WidgetView } from "../types";

const PREVIEW_PX: Record<WidgetSizeId, { w: number; h: number }> = {
  small: { w: 280, h: 130 },
  medium: { w: 280, h: 280 },
  large: { w: 560, h: 230 },
};

export const WidgetCatalogModal = ({
  groups,
  defaultGroupId,
  onClose,
  onAdd,
}: {
  groups: GroupView[];
  defaultGroupId: string;
  onClose: () => void;
  onAdd: (groupId: string, widgetId: string, size: WidgetSizeId) => void;
}) => {
  const [selectedId, setSelectedId] = useState(WIDGET_KINDS[0]?.id);
  const [targetGroup, setTargetGroup] = useState(defaultGroupId);
  const [size, setSize] = useState<WidgetSizeId>("medium");
  const [search, setSearch] = useState("");

  const filtered = WIDGET_KINDS.filter(k => 
    k.name.includes(search) || k.description.includes(search)
  );

  const selectedWidget = WIDGET_REGISTRY[selectedId as keyof typeof WIDGET_REGISTRY];

  // 当切换组件时，把 size 重置为该组件的默认尺寸
  useEffect(() => {
    if (selectedWidget?.defaultSize) setSize(selectedWidget.defaultSize);
  }, [selectedWidget]);

  const demoWidget = useMemo<WidgetView | undefined>(() => {
    if (!selectedWidget) return undefined;
    const dim = WIDGET_SIZE_DIMENSIONS[size];
    return {
      id: PREVIEW_WIDGET_ID,
      groupId: "",
      widget: selectedWidget.id,
      wSpan: dim.wSpan,
      wRow: dim.wRow,
      config: DEMO_CONFIG[selectedWidget.id] ?? {},
      sortOrder: 0,
      gridX: null,
      gridY: null,
      readOnly: true,
    };
  }, [selectedWidget, size]);

  const handleWheel = (e: React.WheelEvent) => {
    // Only process if it's a significant scroll
    if (Math.abs(e.deltaY) < 20) return;
    const idx = filtered.findIndex(w => w.id === selectedId);
    if (idx === -1) return;
    
    // Prevent default scrolling and too fast switching
    if (e.deltaY > 0 && idx < filtered.length - 1) {
      setSelectedId(filtered[idx + 1].id);
    } else if (e.deltaY < 0 && idx > 0) {
      setSelectedId(filtered[idx - 1].id);
    }
  };

  return (
    <div className="wcc-backdrop">
      <div className="wcc-modal glass-strong">
        <div className="wcc-head">
          <div className="wcc-tabs">
            <span className="active">全部</span>
          </div>
          <div className="wcc-search glass">
            <Icon name="search" size={14} />
            <input 
              placeholder="搜索小组件" 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
        </div>

        <div className="wcc-body">
          <div className="wcc-side" onWheel={handleWheel}>
            {filtered.map(w => (
              <div 
                key={w.id} 
                className={"wcc-side-item " + (selectedId === w.id ? "active" : "")}
                onClick={() => setSelectedId(w.id)}
              >
                {w.icon ? <Icon name={w.icon} size={16} /> : <div className="wcc-ph-icon glass"/>}
                <span>{w.name}</span>
              </div>
            ))}
          </div>

          <div className="wcc-main" onWheel={handleWheel}>
            {selectedWidget ? (
              <div className="wcc-preview-card">
                <div className="wcc-preview-info">
                  <h2>{selectedWidget.name}</h2>
                  <p>{selectedWidget.description}</p>
                  
                  <div className="wcc-size-toggles">
                    {WIDGET_SIZE_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={size === id ? "active" : ""}
                        onClick={() => setSize(id)}
                      >
                        {WIDGET_SIZE_LABEL[id]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wcc-preview-canvas">
                  <div
                    className="wcc-pseudo-widget"
                    style={{
                      width: PREVIEW_PX[size].w,
                      height: PREVIEW_PX[size].h,
                    }}
                  >
                     <div className="widget-scale-wrap">
                        {selectedWidget.render(demoWidget)}
                     </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="wcc-empty">未找到对应小组件</div>
            )}
          </div>
        </div>

        <div className="wcc-foot">
          <div className="wcc-dest">
             <span>添加到</span>
             <div className="wcc-dest-select glass">
               <Icon name="folder" size={14} />
               <select value={targetGroup} onChange={e => setTargetGroup(e.target.value)}>
                 {groups.map(g => (
                   <option key={g.id} value={g.id}>{g.name}</option>
                 ))}
               </select>
               <Icon name="chevron-down" size={12} />
             </div>
          </div>
          
          <button className="wcc-btn-cancel" onClick={onClose}>返回</button>
          <button 
            className="wcc-btn-add" 
            onClick={() => onAdd(targetGroup, selectedId, size)}
          >
            添加小组件
          </button>
        </div>
      </div>
    </div>
  );
};
