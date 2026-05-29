import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import type { WidgetProps } from "./types";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { useWorkspace } from "../hooks/useWorkspace";
import { safeHttpUrl } from "../utils/iconSources";
import { isUrlAllowed } from "./iframeWhitelist";

interface IframeConfig {
  url?: string;
  title?: string;
}

const DEFAULTS: IframeConfig = {};

export const IframeWidget = ({ w }: WidgetProps<IframeConfig> = {}) => {
  const { workspace } = useWorkspace();
  // WIDGET-10: 与其它组件一致,统一经 useWidgetConfig 读取配置(原先直接读 w?.config)。
  const { config } = useWidgetConfig<IframeConfig>(w, DEFAULTS);
  const rawUrl = config.url?.trim();
  // SEC-9: 仅允许 http/https,挡掉 javascript:/data: 等伪协议。
  const url = rawUrl ? safeHttpUrl(rawUrl) ?? undefined : undefined;
  const title = config.title || rawUrl;

  // SEC-7: 默认拒绝白名单,精确域名或子域匹配(逻辑已抽到 iframeWhitelist 并单测)。
  const whitelist = workspace?.iframeWhitelist ?? [];
  const isAllowed = isUrlAllowed(url, whitelist);

  // WIDGET-10: iframe 加载失败回退(被远端 X-Frame-Options/CSP 拒绝、网络错误等)。
  const [loadFailed, setLoadFailed] = useState(false);
  // 切换 url / 白名单状态后复位失败态,允许重新尝试加载。
  useEffect(() => {
    setLoadFailed(false);
  }, [url, isAllowed]);

  const renderFallback = (icon: string, message: string) => (
    <div
      style={{
        textAlign: "center", padding: 20, color: "var(--text-soft)", fontSize: 13,
        display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
        justifyContent: "center", height: "100%",
      }}
    >
      <Icon name={icon} size={32} />
      <div>{message}</div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--accent, #8ee6b8)",
            textDecoration: "none", wordBreak: "break-all",
          }}
        >
          <Icon name="external" size={12} />
          在新标签页打开
        </a>
      )}
    </div>
  );

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
            loadFailed ? (
              renderFallback("info", "该网页无法被嵌入(可能被站点的 X-Frame-Options / CSP 拒绝)。")
            ) : (
              <iframe
                src={url}
                title={title || "iframe"}
                sandbox="allow-scripts allow-forms allow-popups"
                allow=""
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => setLoadFailed(true)}
                style={{ width: "100%", height: "100%", border: 0 }}
              />
            )
          ) : (
            renderFallback("shield", "该域名未在 Iframe 白名单中，已拦截。")
          )
        ) : (
          <span>点击齿轮按钮设置网址</span>
        )}
      </div>
    </div>
  );
};
