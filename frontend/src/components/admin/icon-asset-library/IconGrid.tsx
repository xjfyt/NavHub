import { Icon } from "../../Icon";
import type {
  IconAssetSourceView,
  AdminRemoteIconAsset,
  LibraryIconView,
} from "../../../types";
import { PAGE_SIZE } from "./constants";
import { EmptyCell } from "./shared";
import { UserUploadCard, RemoteIconCard } from "./IconCard";

interface IconGridProps {
  sources: IconAssetSourceView[];
  icons: AdminRemoteIconAsset[];
  libIcons: LibraryIconView[];
  iconTotal: number;
  selectedSourceId: string | null;
  loading: boolean;
  iconPage: number;
  searchQuery: string;
  onSelectSource: (sourceId: string | null) => void;
  onSearchChange: (value: string) => void;
  onBatchUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRename: (icon: { id: string; name: string }) => void;
  onDelete: (id: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const IconGrid = ({
  sources,
  icons,
  libIcons,
  iconTotal,
  selectedSourceId,
  loading,
  iconPage,
  searchQuery,
  onSelectSource,
  onSearchChange,
  onBatchUpload,
  onRename,
  onDelete,
  onPrevPage,
  onNextPage,
}: IconGridProps) => (
  <>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>已缓存图标</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor="admin-icon-source-filter"
          style={{ fontSize: 12, color: "var(--text-soft)" }}
        >
          来源筛选
        </label>
        <select
          id="admin-icon-source-filter"
          value={selectedSourceId ?? ""}
          onChange={(e) => onSelectSource(e.target.value || null)}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            borderRadius: 6,
            background: "var(--admin-bg)",
            border: "1px solid var(--admin-border-str)",
            color: "var(--text)",
            cursor: "pointer",
            minWidth: 140,
          }}
        >
          <option value="">全部来源</option>
          <option value="user_uploads">用户上传图库 (通过前台或API上传)</option>
          {sources.map((src) => (
            <option key={src.id} value={src.id}>
              {src.name} · {src.totalFetched} 个
            </option>
          ))}
        </select>
        <div
          className="search-box"
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--admin-bg)",
            border: "1px solid var(--admin-border-str)",
            borderRadius: 6,
            padding: "2px 8px",
            width: 160,
          }}
        >
          <Icon name="search" size={12} color="var(--text-soft)" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索图标..."
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 12,
              padding: "4px 8px",
              width: "100%",
              color: "var(--text)",
            }}
          />
        </div>
        {selectedSourceId && (
          <label
            className="pill-btn primary"
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "5px 10px",
            }}
          >
            <Icon name="plus" size={12} /> 批量上传
            <input
              type="file"
              multiple
              accept="image/*,.svg"
              style={{ display: "none" }}
              onChange={onBatchUpload}
              disabled={loading}
            />
          </label>
        )}
      </div>
    </div>

    <style>{`
        .icon-admin-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(6, 1fr);
        }
        @media (min-width: 1000px) {
          .icon-admin-grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
        @media (min-width: 1400px) {
          .icon-admin-grid {
            grid-template-columns: repeat(12, 1fr);
          }
        }
        @media (min-width: 1800px) {
          .icon-admin-grid {
            grid-template-columns: repeat(16, 1fr);
          }
        }
      `}</style>

    {loading ? (
      <EmptyCell text="加载中..." />
    ) : icons.length === 0 && libIcons.length === 0 ? (
      <EmptyCell text="暂无图标。选择来源并点击「立即抓取」或「上传」开始下载。" />
    ) : (
      <div className="icon-admin-grid">
        {selectedSourceId === "user_uploads"
          ? libIcons.map((w) => (
              <UserUploadCard
                key={w.id}
                icon={w}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          : icons.map((w) => (
              <RemoteIconCard key={w.id} icon={w} onDelete={onDelete} />
            ))}
      </div>
    )}

    {iconTotal > 0 &&
      (() => {
        const totalPages = Math.max(1, Math.ceil(iconTotal / PAGE_SIZE));
        return (
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              alignItems: "center",
              marginTop: 20,
            }}
          >
            <button
              disabled={iconPage === 0}
              onClick={onPrevPage}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                background: "var(--admin-border-soft)",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 6,
                color: "var(--text)",
                opacity: iconPage === 0 ? 0.4 : 1,
              }}
            >
              上一页
            </button>
            <span
              style={{
                lineHeight: "30px",
                fontSize: 13,
                color: "var(--text-soft)",
              }}
            >
              第 {iconPage + 1} / {totalPages} 页 · 共 {iconTotal} 个
            </span>
            <button
              disabled={iconPage + 1 >= totalPages}
              onClick={onNextPage}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                background: "var(--admin-border-soft)",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 6,
                color: "var(--text)",
                opacity: iconPage + 1 >= totalPages ? 0.4 : 1,
              }}
            >
              下一页
            </button>
          </div>
        );
      })()}
  </>
);
