import { useEffect } from "react";
import type { WidgetView } from "../types";
import { WIDGET_REGISTRY } from "../widgets";
import { Icon } from "./Icon";

export const WidgetDetailModal = ({
  widget,
  onClose,
}: {
  widget: WidgetView;
  onClose: () => void;
}) => {
  const info = WIDGET_REGISTRY[widget.widget];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!info) return null;

  const body = info.renderDetail ? info.renderDetail(widget) : info.render(widget);
  const title = info.name;

  return (
    <div className="wcc-backdrop" onClick={onClose}>
      <div
        className="glass-strong"
        style={{
          width: info.detailWidth ?? "min(720px, 90vw)",
          maxHeight: info.detailMaxHeight ?? "80vh",
          padding: 24,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            {info.icon && <Icon name={info.icon} size={16} />}
            <span>{title}</span>
          </h3>
          <button
            className="wcc-btn-cancel"
            onClick={onClose}
            style={{ padding: 4 }}
            title="关闭 (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: info.detailWidth ? "hidden" : "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
};
