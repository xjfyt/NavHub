import React, { useMemo, useState } from "react";
import { DEMO_CONFIG, WIDGET_KINDS, WIDGET_REGISTRY } from "../widgets";
import { PREVIEW_WIDGET_ID } from "../widgets/types";
import { Icon } from "./Icon";
import { GroupView, WidgetView } from "../types";

export const WidgetCatalogModal = ({
  groups,
  defaultGroupId,
  onClose,
  onAdd,
}: {
  groups: GroupView[];
  defaultGroupId: string;
  onClose: () => void;
  onAdd: (groupId: string, widgetId: string, span: number) => void;
}) => {
  const [selectedId, setSelectedId] = useState(WIDGET_KINDS[0]?.id);
  const [targetGroup, setTargetGroup] = useState(defaultGroupId);
  const [size, setSize] = useState<number>(2); // Default medium (span=2)
  const [search, setSearch] = useState("");

  const filtered = WIDGET_KINDS.filter(k => 
    k.name.includes(search) || k.description.includes(search)
  );

  const selectedWidget = WIDGET_REGISTRY[selectedId as keyof typeof WIDGET_REGISTRY];

  const demoWidget = useMemo<WidgetView | undefined>(() => {
    if (!selectedWidget) return undefined;
    return {
      id: PREVIEW_WIDGET_ID,
      groupId: "",
      widget: selectedWidget.id,
      wSpan: selectedWidget.span,
      wRow: null,
      config: DEMO_CONFIG[selectedWidget.id] ?? {},
      sortOrder: 0,
      readOnly: true,
    };
  }, [selectedWidget]);

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
                    <button className={size === 1 ? "active" : ""} onClick={() => setSize(1)}>小</button>
                    <button className={size === 2 ? "active" : ""} onClick={() => setSize(2)}>中</button>
                    <button className={size === 3 ? "active" : ""} onClick={() => setSize(3)}>大</button>
                  </div>
                </div>

                <div className="wcc-preview-canvas">
                  <div 
                    className="wcc-pseudo-widget"
                    style={{ 
                      width: size === 1 ? 160 : size === 2 ? 340 : 520,
                      height: 160
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
