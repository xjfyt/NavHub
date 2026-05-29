import { Icon } from "../components/Icon";
import type { WidgetProps } from "./types";
import { useWorkspace } from "../hooks/useWorkspace";
import { safeHttpUrl } from "../utils/iconSources";

interface IframeConfig {
  url?: string;
  title?: string;
}

export const IframeWidget = ({ w }: WidgetProps<IframeConfig> = {}) => {
  const { workspace } = useWorkspace();
  const cfg = (w?.config ?? {}) as IframeConfig;
  const rawUrl = cfg.url?.trim();
  // SEC-9: 仅允许 http/https,挡掉 javascript:/data: 等伪协议。
  const url = rawUrl ? safeHttpUrl(rawUrl) ?? undefined : undefined;
  const title = cfg.title || rawUrl;

  // SEC-7: 白名单为空时默认拒绝(而非放行任意站点);匹配用精确域名或其子域,
  // 不再用 endsWith(allowed) 这种会被 evil-example.com 绕过的后缀判断。
  const whitelist = workspace?.iframeWhitelist ?? [];
  let isAllowed = false;
  if (url && whitelist.length > 0) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      isAllowed = whitelist.some((entry) => {
        const allowed = entry.trim().toLowerCase().replace(/^\.+/, "");
        return !!allowed && (host === allowed || host.endsWith("." + allowed));
      });
    } catch {
      isAllowed = false;
    }
  }

  return (
    <div className="widget w-iframe">
      <div className="iframe-head">
        <span className="dot" style={{ background: "#ff6b6b" }} />
        <span className="dot" style={{ background: "#ffd07a" }} />
        <span className="dot" style={{ background: "#8ee6b8" }} />
        <span style={{ marginLeft: 6 }}>{title || "嵌入网页"}</span>
        <span style={{ marginLeft: "auto" }}>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={12} />
            </a>
          )}
        </span>
      </div>
      <div className="iframe-placeholder">
        {url ? (
          isAllowed ? (
            <iframe
              src={url}
              title={title || "iframe"}
              sandbox="allow-scripts allow-forms allow-popups"
              allow=""
              referrerPolicy="no-referrer"
              loading="lazy"
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: "var(--text-soft)", fontSize: 13, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Icon name="shield" size={32} />
              <div>该域名未在 Iframe 白名单中，已拦截。</div>
            </div>
          )
        ) : (
          <span>点击齿轮按钮设置网址</span>
        )}
      </div>
    </div>
  );
};

