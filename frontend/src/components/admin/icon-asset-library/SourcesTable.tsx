import type { IconAssetSourceView } from "../../../types";
import { formatDate, siteOriginHref } from "./helpers";
import { cell, th, EmptyCell } from "./shared";

interface SourceRowProps {
  src: IconAssetSourceView;
  selected: boolean;
  fetching: string | null;
  onToggleEnabled: (src: IconAssetSourceView) => void;
  onTriggerFetch: (src: IconAssetSourceView) => void;
  onEdit: (src: IconAssetSourceView) => void;
  onDelete: (id: string) => void;
}

const SourceRow = ({
  src,
  selected,
  fetching,
  onToggleEnabled,
  onTriggerFetch,
  onEdit,
  onDelete,
}: SourceRowProps) => (
  <tr
    style={{
      background: selected ? "var(--admin-border-str)" : "transparent",
    }}
  >
    <td style={cell}>
      <a
        href={siteOriginHref(src.siteUrl)}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontWeight: 500,
          color: "var(--text)",
          textDecoration: "none",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) =>
          (e.currentTarget.style.textDecoration = "underline")
        }
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
      >
        {src.name}
      </a>
    </td>
    <td style={{ ...cell, textAlign: "center" }}>{src.cacheTtlHours}</td>
    <td style={{ ...cell, textAlign: "center" }}>{src.fetchIntervalHours}</td>
    <td style={{ ...cell, textAlign: "center" }}>{src.totalFetched}</td>
    <td style={cell}>{formatDate(src.lastFetchedAt)}</td>
    <td style={cell}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onToggleEnabled(src);
        }}
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          background: src.enabled
            ? "rgba(62,190,120,0.15)"
            : "rgba(150,150,150,0.1)",
          color: src.enabled ? "#3ebe78" : "var(--text-soft)",
        }}
      >
        {src.enabled ? "启用" : "停用"}
      </span>
    </td>
    <td
      style={{ ...cell, whiteSpace: "nowrap" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => onTriggerFetch(src)}
        disabled={fetching === src.id}
        style={{
          marginRight: 6,
          padding: "4px 10px",
          fontSize: 12,
          cursor: "pointer",
          background: "var(--accent)",
          color: "var(--text-inv)",
          border: "none",
          borderRadius: 6,
          opacity: fetching === src.id ? 0.6 : 1,
        }}
      >
        {fetching === src.id ? "抓取中..." : "立即抓取"}
      </button>
      <button
        onClick={() => onEdit(src)}
        style={{
          marginRight: 6,
          padding: "4px 10px",
          fontSize: 12,
          cursor: "pointer",
          background: "transparent",
          border: "1px solid var(--admin-border-str)",
          borderRadius: 6,
          color: "var(--text)",
        }}
      >
        编辑
      </button>
      <button
        onClick={() => onDelete(src.id)}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          cursor: "pointer",
          background: "rgba(255,90,90,0.1)",
          border: "none",
          borderRadius: 6,
          color: "#ff6b6b",
        }}
      >
        删除
      </button>
    </td>
  </tr>
);

interface SourcesTableProps {
  sources: IconAssetSourceView[];
  loading: boolean;
  selectedSourceId: string | null;
  fetching: string | null;
  onToggleEnabled: (src: IconAssetSourceView) => void;
  onTriggerFetch: (src: IconAssetSourceView) => void;
  onEdit: (src: IconAssetSourceView) => void;
  onDelete: (id: string) => void;
}

export const SourcesTable = ({
  sources,
  loading,
  selectedSourceId,
  fetching,
  onToggleEnabled,
  onTriggerFetch,
  onEdit,
  onDelete,
}: SourcesTableProps) => (
  <div
    style={{
      background: "var(--admin-border-soft)",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 32,
    }}
  >
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {[
            "名称",
            "缓存(h)",
            "间隔(h)",
            "已抓取",
            "最后抓取",
            "状态",
            "操作",
          ].map((h) => (
            <th key={h} style={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={7} style={cell}>
              <EmptyCell text="加载中..." />
            </td>
          </tr>
        ) : sources.length === 0 ? (
          <tr>
            <td colSpan={7} style={cell}>
              <EmptyCell text="暂无内置图标源，请点击右上角添加" />
            </td>
          </tr>
        ) : (
          sources.map((src) => (
            <SourceRow
              key={src.id}
              src={src}
              selected={selectedSourceId === src.id}
              fetching={fetching}
              onToggleEnabled={onToggleEnabled}
              onTriggerFetch={onTriggerFetch}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </tbody>
    </table>
  </div>
);
