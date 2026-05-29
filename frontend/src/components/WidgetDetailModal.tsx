import type { WidgetView } from "../types";
import { WIDGET_REGISTRY } from "../widgets";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export const WidgetDetailModal = ({
  widget,
  onClose,
  onEdit,
}: {
  widget: WidgetView;
  onClose: () => void;
  /** UX-22:在详情头部提供直达编辑入口;为空时不显示齿轮按钮(如组件不可编辑或无权限)。 */
  onEdit?: () => void;
}) => {
  const info = WIDGET_REGISTRY[widget.widget];

  if (!info) return null;

  const body = info.renderDetail
    ? info.renderDetail(widget)
    : info.render(widget);
  const title = info.name;

  return (
    <Modal
      onClose={onClose}
      labelledById="widget-detail-title"
      overlayClassName="wcc-backdrop"
      className="glass-strong"
      contentStyle={{
        width: info.detailWidth ?? "min(720px, 90vw)",
        maxHeight: info.detailMaxHeight ?? "80vh",
        padding: 24,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3
          id="widget-detail-title"
          style={{
            margin: 0,
            flex: 1,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {info.icon && <Icon name={info.icon} size={16} />}
          <span>{title}</span>
        </h3>
        {onEdit && (
          <button
            className="wcc-btn-cancel"
            onClick={onEdit}
            style={{ padding: 4, marginRight: 4 }}
            title="编辑组件"
            aria-label="编辑组件"
          >
            <Icon name="settings" size={16} />
          </button>
        )}
        <button
          className="wcc-btn-cancel"
          onClick={onClose}
          style={{ padding: 4 }}
          title="关闭 (Esc)"
          aria-label="关闭 (Esc)"
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
    </Modal>
  );
};
