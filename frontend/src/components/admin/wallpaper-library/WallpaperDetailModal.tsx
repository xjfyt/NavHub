import type { AdminRemoteWallpaper } from "../../../types";
import { formatBytes, thumbnailSrc, hasThumbnail } from "./helpers";

interface WallpaperDetailModalProps {
  wallpaper: AdminRemoteWallpaper;
  sourceName: string;
  onClose: () => void;
  onRename: (w: AdminRemoteWallpaper) => void;
  onDelete: (id: string) => void;
}

export const WallpaperDetailModal = ({
  wallpaper,
  sourceName,
  onClose,
  onRename,
  onDelete,
}: WallpaperDetailModalProps) => (
  <div
    onClick={onClose}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "var(--admin-card-bg, var(--admin-bg))",
        border: "1px solid var(--admin-border-str)",
        borderRadius: 14,
        width: "min(560px, 100%)",
        maxHeight: "calc(100vh - 48px)",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {hasThumbnail(wallpaper) ? (
        <img
          src={thumbnailSrc(wallpaper)}
          alt={wallpaper.title ?? ""}
          style={{
            width: "100%",
            maxHeight: 280,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: 200,
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-soft)",
          }}
        >
          {wallpaper.mediaType === "video" ? "🎬 视频" : "🖼 图片"}
        </div>
      )}
      <div style={{ padding: 20 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 4,
            wordBreak: "break-word",
          }}
        >
          {wallpaper.title ?? "未命名壁纸"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-soft)",
            marginBottom: 16,
          }}
        >
          {sourceName} ·{" "}
          {wallpaper.mediaType === "video" ? "动态壁纸" : "静态壁纸"}
          {wallpaper.author ? ` · ${wallpaper.author}` : ""}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            rowGap: 8,
            columnGap: 14,
            fontSize: 12,
          }}
        >
          <div style={{ color: "var(--text-soft)" }}>分辨率</div>
          <div>
            {wallpaper.width && wallpaper.height
              ? `${wallpaper.width} × ${wallpaper.height}`
              : wallpaper.mediaType === "video"
                ? "—（视频未探测）"
                : "—"}
          </div>
          <div style={{ color: "var(--text-soft)" }}>文件大小</div>
          <div>{formatBytes(wallpaper.fileSizeBytes)}</div>
          <div style={{ color: "var(--text-soft)" }}>抓取时间</div>
          <div>{new Date(wallpaper.fetchedAt).toLocaleString("zh-CN")}</div>
          <div style={{ color: "var(--text-soft)" }}>原始链接</div>
          <div style={{ wordBreak: "break-all" }}>
            <a
              href={wallpaper.originalUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)" }}
            >
              {wallpaper.originalUrl}
            </a>
          </div>
          {wallpaper.pageUrl && (
            <>
              <div style={{ color: "var(--text-soft)" }}>来源页</div>
              <div style={{ wordBreak: "break-all" }}>
                <a
                  href={wallpaper.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  {wallpaper.pageUrl}
                </a>
              </div>
            </>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              background: "transparent",
              border: "1px solid var(--admin-border-str)",
              borderRadius: 8,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            关闭
          </button>
          <button
            onClick={() => onRename(wallpaper)}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              background: "var(--admin-border-str)",
              border: "none",
              borderRadius: 8,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            重命名
          </button>
          <button
            onClick={() => onDelete(wallpaper.id)}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              background: "rgba(255,90,90,0.15)",
              border: "none",
              borderRadius: 8,
              color: "#ff6b6b",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
);
