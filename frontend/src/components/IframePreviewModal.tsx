import { useEffect, useRef, useState } from "react";
import { IconView } from "../types";
import { Icon } from "./Icon";
import { safeHttpUrl } from "../utils/iconSources";

export const IframePreviewModal = ({
  icon,
  onClose,
}: {
  icon: IconView;
  onClose: () => void;
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // SEC-8/SEC-9: 仅允许 http/https;非安全 URL 不嵌入(防 javascript:/data: 与沙箱逃逸)。
  const url = safeHttpUrl(icon.url) ?? "";

  return (
    <div className="wcc-backdrop" onClick={onClose} style={{ zIndex: 9000 }}>
      <div
        className="iframe-preview-modal glass-strong"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 1200px)",
          height: "min(88vh, 900px)",
          borderRadius: "20px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
          animation: "iframe-modal-in 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.1))",
            background: "rgba(0,0,0,0.15)",
            flexShrink: 0,
          }}
        >
          {/* Traffic light dots */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", marginRight: 4 }}>
            <div
              onClick={onClose}
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: "#ff5f57",
                cursor: "pointer",
                transition: "opacity 0.15s",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)",
              }}
              title="关闭"
            />
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: "#febc2e",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)",
                opacity: 0.5,
              }}
            />
            <div
              onClick={() => {
                if (url) window.open(url, "_blank");
              }}
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: "#28c840",
                cursor: "pointer",
                transition: "opacity 0.15s",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)",
              }}
              title="在新标签页打开"
            />
          </div>

          {/* URL bar */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--text-soft, #aaa)",
              fontFamily: "var(--font-mono, monospace)",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Icon name="lock" size={11} color="var(--text-mute, #666)" />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {url}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => {
                if (iframeRef.current) {
                  setLoading(true);
                  setLoadError(false);
                  iframeRef.current.src = url;
                }
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-soft, #aaa)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
              title="刷新"
            >
              <Icon name="activity" size={14} />
            </button>
            <button
              onClick={() => {
                if (url) window.open(url, "_blank");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-soft, #aaa)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
              title="在新标签页打开"
            >
              <Icon name="external" size={14} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-soft, #aaa)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
              title="关闭"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Iframe body */}
        <div style={{ flex: 1, position: "relative", background: "#fff" }}>
          {loading && !loadError && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: "rgba(255,255,255,0.95)",
                zIndex: 2,
              }}
            >
              <div className="iframe-loading-spinner" />
              <span style={{ fontSize: 13, color: "#888" }}>
                正在加载 {icon.name}...
              </span>
            </div>
          )}

          {loadError && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                background: "rgba(255,255,255,0.97)",
                zIndex: 2,
              }}
            >
              <Icon name="shield" size={40} color="#ccc" />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>
                此页面无法内嵌加载
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#999",
                  maxWidth: 400,
                  textAlign: "center",
                  lineHeight: 1.6,
                }}
              >
                该站点可能设置了 X-Frame-Options 或 CSP 策略，阻止了 iframe 嵌入。
              </div>
              <button
                onClick={() => {
                  if (url) window.open(url, "_blank");
                  onClose();
                }}
                style={{
                  marginTop: 8,
                  padding: "8px 24px",
                  background: "#333",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                在新标签页打开
              </button>
            </div>
          )}

          <iframe
            ref={iframeRef}
            src={url}
            title={icon.name}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setLoadError(true);
            }}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            sandbox="allow-scripts allow-popups allow-forms allow-modals"
          />
        </div>
      </div>
    </div>
  );
};
