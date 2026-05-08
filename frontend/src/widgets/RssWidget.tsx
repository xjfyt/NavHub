import { api } from "../api";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { useWidgetData } from "../hooks/useWidgetData";
import type { WidgetProps } from "./types";

type SourceId = "weibo" | "zhihu" | "bilibili" | "juejin";

interface RssConfig {
  source?: SourceId;
}

const DEFAULTS: RssConfig = { source: "weibo" };

const SOURCE_LABEL: Record<SourceId, string> = {
  weibo: "微博",
  zhihu: "知乎",
  bilibili: "B站",
  juejin: "掘金",
};

export const RssWidget = ({ w }: WidgetProps<RssConfig> = {}) => {
  const { config } = useWidgetConfig<RssConfig>(w, DEFAULTS);
  const source = config.source ?? "weibo";
  const { data, loading, error } = useWidgetData(
    () => api.hot(source),
    [source],
    { refreshMs: 5 * 60_000 },
  );

  const items = data ?? [];

  return (
    <div className="widget w-rss">
      <div className="widget-header">
        <span className="widget-title">热搜 · {SOURCE_LABEL[source]}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {loading ? "LOADING" : error ? "ERROR" : "UPDATED"}
        </span>
      </div>
      {error && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {error.message || "加载失败"}
        </div>
      )}
      <div className="rss-list">
        {items.length === 0 && !loading && !error && (
          <div className="muted" style={{ fontSize: 12 }}>（暂无数据）</div>
        )}
        {items.slice(0, 8).map((it, i) => {
          const row = (
            <>
              <span className="rank" style={i < 3 ? { color: "#ff9b7b" } : {}}>{i + 1}</span>
              <span className="title">{it.title}</span>
              <span className="heat">{it.heat}</span>
            </>
          );
          return it.url ? (
            <a
              key={i}
              className="rss-item"
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", color: "inherit" }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {row}
            </a>
          ) : (
            <div key={i} className="rss-item">{row}</div>
          );
        })}
      </div>
    </div>
  );
};

export const RssDetail = ({ w }: WidgetProps<RssConfig> = {}) => {
  const { config, update } = useWidgetConfig<RssConfig>(w, DEFAULTS);
  const source = config.source ?? "weibo";
  const { data, loading, error } = useWidgetData(
    () => api.hot(source),
    [source],
    { refreshMs: 5 * 60_000 },
  );
  const items = data ?? [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(SOURCE_LABEL) as SourceId[]).map((s) => (
          <button
            key={s}
            onClick={() => update({ source: s })}
            className={source === s ? "wcc-btn-add" : "wcc-btn-cancel"}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >{SOURCE_LABEL[s]}</button>
        ))}
        {loading && <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>加载中…</span>}
      </div>
      {error && <div className="muted" style={{ fontSize: 12 }}>{error.message || "加载失败"}</div>}
      <div style={{ display: "grid", gap: 6, maxHeight: 440, overflowY: "auto" }}>
        {items.length === 0 && !loading && !error && (
          <div className="muted" style={{ fontSize: 12 }}>（暂无数据）</div>
        )}
        {items.map((it, i) => {
          const content = (
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
              <span style={{ minWidth: 22, textAlign: "center", fontSize: 13, fontWeight: 700, color: i < 3 ? "#ff9b7b" : "var(--text-soft)" }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{it.title}</span>
              {it.heat && <span className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{it.heat}</span>}
            </div>
          );
          return it.url ? (
            <a key={i} href={it.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{content}</a>
          ) : <div key={i}>{content}</div>;
        })}
      </div>
    </div>
  );
};
