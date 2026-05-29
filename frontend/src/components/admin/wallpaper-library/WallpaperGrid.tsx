import type { WallpaperSourceView, AdminRemoteWallpaper } from "../../../types";
import { PAGE_SIZE } from "./constants";
import { EmptyCell } from "./shared";
import { WallpaperCard } from "./WallpaperCard";

interface WallpaperGridProps {
  sources: WallpaperSourceView[];
  wallpapers: AdminRemoteWallpaper[];
  wallpaperTotal: number;
  selectedSourceId: string | null;
  loading: boolean;
  wallpaperPage: number;
  onSelectSource: (sourceId: string | null) => void;
  onOpen: (w: AdminRemoteWallpaper) => void;
  onContextMenu: (e: React.MouseEvent, w: AdminRemoteWallpaper) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const WallpaperGrid = ({
  sources,
  wallpapers,
  wallpaperTotal,
  selectedSourceId,
  loading,
  wallpaperPage,
  onSelectSource,
  onOpen,
  onContextMenu,
  onPrevPage,
  onNextPage,
}: WallpaperGridProps) => (
  <>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>已缓存壁纸</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor="admin-wp-source-filter"
          style={{ fontSize: 12, color: "var(--text-soft)" }}
        >
          来源筛选
        </label>
        <select
          id="admin-wp-source-filter"
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
          <option value="">全部来源（{wallpaperTotal} 张）</option>
          {sources.map((src) => (
            <option key={src.id} value={src.id}>
              {src.name} · {src.totalFetched} 张
            </option>
          ))}
        </select>
      </div>
    </div>

    <style>{`
        .wallpaper-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (min-width: 1300px) {
          .wallpaper-grid {
            grid-template-columns: repeat(6, 1fr);
          }
        }
        @media (min-width: 1700px) {
          .wallpaper-grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
      `}</style>

    {loading ? (
      <EmptyCell text="加载中..." />
    ) : wallpapers.length === 0 ? (
      <EmptyCell text="暂无壁纸。选择来源并点击「立即抓取」开始下载。" />
    ) : (
      <div className="wallpaper-grid">
        {wallpapers.map((w) => (
          <WallpaperCard
            key={w.id}
            wallpaper={w}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    )}

    {/* Pagination */}
    {wallpaperTotal > 0 &&
      (() => {
        const totalPages = Math.max(1, Math.ceil(wallpaperTotal / PAGE_SIZE));
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
              disabled={wallpaperPage === 0}
              onClick={onPrevPage}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                background: "var(--admin-border-soft)",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 6,
                color: "var(--text)",
                opacity: wallpaperPage === 0 ? 0.4 : 1,
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
              第 {wallpaperPage + 1} / {totalPages} 页 · 共 {wallpaperTotal} 张
            </span>
            <button
              disabled={wallpaperPage + 1 >= totalPages}
              onClick={onNextPage}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                background: "var(--admin-border-soft)",
                border: "1px solid var(--admin-border-str)",
                borderRadius: 6,
                color: "var(--text)",
                opacity: wallpaperPage + 1 >= totalPages ? 0.4 : 1,
              }}
            >
              下一页
            </button>
          </div>
        );
      })()}
  </>
);
