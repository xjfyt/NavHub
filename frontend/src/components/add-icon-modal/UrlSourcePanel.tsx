import { Icon } from "../Icon";

interface UrlSourcePanelProps {
  normalizedUrl: string | null;
  isSearchingUrl: boolean;
  searchNote: string | null;
  autoImageUrls: { url: string; source: string }[];
  failedImageUrls: Set<string>;
  selectedAutoImageUrl: string | null;
  onSelectAutoImageUrl: (url: string) => void;
  onImageError: (url: string) => void;
}

export function UrlSourcePanel({
  normalizedUrl,
  isSearchingUrl,
  searchNote,
  autoImageUrls,
  failedImageUrls,
  selectedAutoImageUrl,
  onSelectAutoImageUrl,
  onImageError,
}: UrlSourcePanelProps) {
  const visible = autoImageUrls.filter((ic) => !failedImageUrls.has(ic.url));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "var(--panel-bg)",
            border: "1px solid var(--border-color)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {selectedAutoImageUrl ? (
            <img
              src={selectedAutoImageUrl}
              alt=""
              style={{
                width: "70%",
                height: "70%",
                objectFit: "contain",
              }}
            />
          ) : (
            <Icon
              name={isSearchingUrl ? "activity" : "globe"}
              size={18}
              color="var(--text-soft)"
            />
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-mute)",
            lineHeight: 1.6,
            minWidth: 0,
            flex: 1,
          }}
        >
          {!normalizedUrl
            ? "输入有效连结后，将自动尝试获取对应官方图标。"
            : isSearchingUrl
              ? "正在检索站点图标…"
              : searchNote || "已检索到图标，点击下方选择。"}
        </div>
      </div>
      {visible.length > 0 && (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
            gap: 8,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {visible.map((icon) => (
            <button
              key={icon.url}
              type="button"
              className={
                "builtin-opt " +
                (selectedAutoImageUrl === icon.url ? "active" : "")
              }
              onClick={() => onSelectAutoImageUrl(icon.url)}
              title={icon.source}
              style={{
                background:
                  selectedAutoImageUrl === icon.url
                    ? "var(--accent)"
                    : "var(--panel-bg)",
                borderColor: "var(--border-color)",
                width: "100%",
                minHeight: 88,
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 8,
                overflow: "hidden",
                color: "inherit",
              }}
            >
              <img
                src={icon.url}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  objectFit: "contain",
                }}
                onError={() => onImageError(icon.url)}
              />
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-mute)",
                }}
              >
                {icon.source}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
