import type { WallpaperSourceView } from "../../../types";
import type { UploadProgressState } from "./types";
import { formatDate, siteOriginHref } from "./helpers";
import { cell, th, EmptyCell } from "./shared";

interface SourceRowProps {
  src: WallpaperSourceView;
  selected: boolean;
  uploadingTo: string | null;
  uploadProgress: UploadProgressState | null;
  fetching: string | null;
  onSelect: (src: WallpaperSourceView) => void;
  onToggleEnabled: (src: WallpaperSourceView) => void;
  onUpload: (sourceId: string) => void;
  onTriggerFetch: (src: WallpaperSourceView) => void;
  onEdit: (src: WallpaperSourceView) => void;
  onDelete: (id: string) => void;
}

const SourceRow = ({
  src,
  selected,
  uploadingTo,
  uploadProgress,
  fetching,
  onSelect,
  onToggleEnabled,
  onUpload,
  onTriggerFetch,
  onEdit,
  onDelete,
}: SourceRowProps) => (
  <tr
    // UX-10: 行此前带「选中高亮」样式却无任何点击行为(误导)。
    // 列表本就用 selectedSourceId 驱动来源筛选,这里把整行接成
    // 点击即按该来源筛选下方壁纸(再次点击取消),并补上指针/提示。
    onClick={() => onSelect(src)}
    title={selected ? "再次点击取消按此来源筛选" : "点击按此来源筛选下方壁纸"}
    style={{
      background: selected ? "var(--admin-border-str)" : "transparent",
      cursor: "pointer",
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
    <td style={cell}>
      <span
        style={{
          fontSize: 11,
          background: "var(--admin-border-str)",
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {src.scraperType}
      </span>
    </td>
    <td style={{ ...cell, textAlign: "center" }}>{src.fetchBatchSize}</td>
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
      {src.scraperType === "manual" ? (
        <button
          onClick={() => onUpload(src.id)}
          disabled={uploadingTo === src.id}
          style={{
            marginRight: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
            background: "var(--accent)",
            color: "var(--text-inv)",
            border: "none",
            borderRadius: 6,
            opacity: uploadingTo === src.id ? 0.6 : 1,
          }}
        >
          {uploadingTo === src.id && uploadProgress
            ? `上传 ${uploadProgress.overallPercent}%`
            : uploadingTo === src.id
              ? "上传中..."
              : "上传壁纸"}
        </button>
      ) : (
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
      )}
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
  sources: WallpaperSourceView[];
  loading: boolean;
  selectedSourceId: string | null;
  uploadingTo: string | null;
  uploadProgress: UploadProgressState | null;
  fetching: string | null;
  onSelect: (src: WallpaperSourceView) => void;
  onToggleEnabled: (src: WallpaperSourceView) => void;
  onUpload: (sourceId: string) => void;
  onTriggerFetch: (src: WallpaperSourceView) => void;
  onEdit: (src: WallpaperSourceView) => void;
  onDelete: (id: string) => void;
}

export const SourcesTable = ({
  sources,
  loading,
  selectedSourceId,
  uploadingTo,
  uploadProgress,
  fetching,
  onSelect,
  onToggleEnabled,
  onUpload,
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
            "类型",
            "批次",
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
            <td colSpan={9} style={cell}>
              <EmptyCell text="加载中..." />
            </td>
          </tr>
        ) : sources.length === 0 ? (
          <tr>
            <td colSpan={9} style={cell}>
              <EmptyCell text="暂无来源，点击「添加来源」开始" />
            </td>
          </tr>
        ) : (
          sources.map((src) => (
            <SourceRow
              key={src.id}
              src={src}
              selected={selectedSourceId === src.id}
              uploadingTo={uploadingTo}
              uploadProgress={uploadProgress}
              fetching={fetching}
              onSelect={onSelect}
              onToggleEnabled={onToggleEnabled}
              onUpload={onUpload}
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
