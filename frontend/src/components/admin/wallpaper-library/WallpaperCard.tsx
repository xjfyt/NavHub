import type { AdminRemoteWallpaper } from "../../../types";
import { thumbnailSrc, hasThumbnail } from "./helpers";

interface WallpaperCardProps {
  wallpaper: AdminRemoteWallpaper;
  onOpen: (w: AdminRemoteWallpaper) => void;
  onContextMenu: (e: React.MouseEvent, w: AdminRemoteWallpaper) => void;
}

export const WallpaperCard = ({
  wallpaper: w,
  onOpen,
  onContextMenu,
}: WallpaperCardProps) => (
  <div
    onClick={() => onOpen(w)}
    onContextMenu={(e) => onContextMenu(e, w)}
    style={{
      background: "var(--admin-border-soft)",
      borderRadius: 10,
      overflow: "hidden",
      position: "relative",
      border: "1px solid var(--admin-border-str)",
      cursor: "pointer",
      transition: "transform 0.15s ease",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
  >
    {hasThumbnail(w) ? (
      <img
        src={thumbnailSrc(w)}
        alt={w.title ?? "壁纸"}
        // PERF-4: 缩略图网格按需懒加载、异步解码,屏外图片不阻塞首屏。
        loading="lazy"
        decoding="async"
        style={{
          width: "100%",
          height: 112,
          objectFit: "cover",
          display: "block",
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    ) : (
      <div
        style={{
          width: "100%",
          height: 112,
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-soft)",
          fontSize: 11,
        }}
      >
        {w.mediaType === "video" ? "🎬 视频" : "🖼 图片"}
      </div>
    )}

    {/* Video indicator badge */}
    {w.mediaType === "video" && (
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          background: "rgba(0,0,0,0.65)",
          borderRadius: 4,
          padding: "2px 6px",
          fontSize: 10,
          color: "#fff",
        }}
      >
        VIDEO
      </div>
    )}

    {/* Resolution badge */}
    {w.width && w.height && (
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "rgba(0,0,0,0.65)",
          borderRadius: 4,
          padding: "2px 6px",
          fontSize: 10,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {w.width}×{w.height}
      </div>
    )}

    <div style={{ padding: "8px 10px 10px" }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={w.title ?? undefined}
      >
        {w.title ?? "未命名壁纸"}
      </div>
      {w.author && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-soft)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {w.author}
        </div>
      )}
    </div>
  </div>
);
