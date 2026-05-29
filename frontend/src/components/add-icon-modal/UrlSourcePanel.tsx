import { Icon } from "../Icon";

interface UrlSourcePanelProps {
  normalizedUrl: string | null;
  isSearchingUrl: boolean;
  autoImageUrls: { url: string; source: string }[];
  failedImageUrls: Set<string>;
  selectedAutoImageUrl: string | null;
  onSelectAutoImageUrl: (url: string) => void;
  onImageError: (url: string) => void;
}

export function UrlSourcePanel({
  normalizedUrl,
  isSearchingUrl,
  autoImageUrls,
  failedImageUrls,
  selectedAutoImageUrl,
  onSelectAutoImageUrl,
  onImageError,
}: UrlSourcePanelProps) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
          }}
        >
          {selectedAutoImageUrl ? (
            <img
              src={selectedAutoImageUrl}
              alt="已选图标预览"
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
          }}
        >
          {normalizedUrl
            ? isSearchingUrl
              ? "正在深度检索站点图标..."
              : "已检索到图标候选，点击下方选择。"
            : "输入有效连结后，将自动尝试获取对应官方图标。"}
        </div>
      </div>
      {autoImageUrls.filter((ic) => !failedImageUrls.has(ic.url)).length >
        0 && (
        <div
          style={{
            marginTop: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            maxHeight: 180,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {autoImageUrls
            .filter((ic) => !failedImageUrls.has(ic.url))
            .map((icon, i) => (
              <div
                key={i}
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
                  aspectRatio: "1",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <img
                  src={icon.url}
                  alt={`来自 ${icon.source} 的图标候选`}
                  style={{
                    maxWidth: 24,
                    maxHeight: 24,
                    objectFit: "contain",
                  }}
                  onError={() => onImageError(icon.url)}
                />
                <span
                  style={{
                    fontSize: 9,
                    position: "absolute",
                    bottom: 2,
                    color: "var(--text-mute)",
                  }}
                >
                  {icon.source}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
