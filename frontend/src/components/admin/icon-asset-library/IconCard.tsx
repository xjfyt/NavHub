import type { AdminRemoteIconAsset, LibraryIconView } from "../../../types";
import { remoteIconSrc } from "./helpers";

const cardStyle: React.CSSProperties = {
  background: "var(--admin-border-soft)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
  border: "1px solid var(--admin-border-str)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 8px 8px",
};

const imgStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  objectFit: "contain",
  display: "block",
};

const nameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  marginTop: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
  textAlign: "center",
};

interface UserUploadCardProps {
  icon: LibraryIconView;
  onRename: (icon: { id: string; name: string }) => void;
  onDelete: (id: string) => void;
}

export const UserUploadCard = ({
  icon: w,
  onRename,
  onDelete,
}: UserUploadCardProps) => (
  <div style={cardStyle}>
    <img
      src={w.url}
      alt={w.name ?? "图标"}
      // PERF-4: 图标网格按需懒加载、异步解码,屏外图标不阻塞首屏。
      loading="lazy"
      decoding="async"
      style={imgStyle}
    />
    <div style={nameStyle} title={w.name ?? undefined}>
      {w.name ?? "未命名"}
    </div>
    <div
      style={{
        display: "flex",
        gap: 4,
        width: "100%",
        marginTop: 8,
      }}
    >
      <button
        onClick={() => onRename({ id: w.id, name: w.name || "" })}
        style={{
          flex: 1,
          padding: "2px 8px",
          fontSize: 11,
          cursor: "pointer",
          background: "rgba(100,100,255,0.1)",
          border: "none",
          borderRadius: 4,
          color: "#6464ff",
        }}
      >
        重命名
      </button>
      <button
        onClick={() => onDelete(w.id)}
        style={{
          flex: 1,
          padding: "2px 8px",
          fontSize: 11,
          cursor: "pointer",
          background: "rgba(255,90,90,0.1)",
          border: "none",
          borderRadius: 4,
          color: "#ff6b6b",
        }}
      >
        删除
      </button>
    </div>
  </div>
);

interface RemoteIconCardProps {
  icon: AdminRemoteIconAsset;
  onDelete: (id: string) => void;
}

export const RemoteIconCard = ({ icon: w, onDelete }: RemoteIconCardProps) => (
  <div style={cardStyle}>
    <img
      src={remoteIconSrc(w)}
      alt={w.title ?? "图标"}
      // PERF-4: 图标网格按需懒加载、异步解码,屏外图标不阻塞首屏。
      loading="lazy"
      decoding="async"
      style={imgStyle}
    />
    <div style={nameStyle} title={w.title ?? undefined}>
      {w.title ?? "未命名"}
    </div>
    <button
      onClick={() => onDelete(w.id)}
      style={{
        marginTop: 8,
        padding: "2px 8px",
        fontSize: 11,
        cursor: "pointer",
        background: "rgba(255,90,90,0.1)",
        border: "none",
        borderRadius: 4,
        color: "#ff6b6b",
        alignSelf: "stretch",
      }}
    >
      删除
    </button>
  </div>
);
