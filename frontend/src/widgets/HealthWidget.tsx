import { useWidgetData } from "../hooks/useWidgetData";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";

async function probe(path: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(path, {
      signal,
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const HealthWidget = ({ w }: WidgetProps = {}) => {
  const tier = widgetTier(w?.wSpan, w?.wRow);
  const { data, loading } = useWidgetData(
    async (signal) => {
      const [live, ready] = await Promise.all([
        probe("/api/healthz", signal),
        probe("/api/readyz", signal),
      ]);
      return { live, ready, at: Date.now() };
    },
    [],
    { refreshMs: 30_000, cacheKey: "health:core" },
  );
  const live = data?.live;
  const ready = data?.ready;
  const ok = live && ready;
  const word = loading && !data ? "检测中" : ok ? "在线" : "降级";
  return (
    <div className="widget w-health">
      <div className="widget-header">
        <span className="widget-title">系统状态</span>
        <span className="muted" style={{ fontSize: 10 }}>
          {loading && !data ? "检测中" : ok ? "正常" : "需关注"}
        </span>
      </div>
      <div className="health-status">
        <span
          className={
            "health-dot" + (loading && !data ? "" : ok ? " ok" : " bad")
          }
        />
        <span className="health-word">{word}</span>
      </div>
      {tier !== "sm" && (
        <div className="health-rows">
          <div className="health-row">
            <span>存活</span>
            <span>{live ? "正常" : loading ? "…" : "失败"}</span>
          </div>
          <div className="health-row">
            <span>就绪</span>
            <span>{ready ? "正常" : loading ? "…" : "失败"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const HealthDetail = ({ w }: WidgetProps = {}) => {
  void w;
  const { data, loading, refresh } = useWidgetData(
    async (signal) => {
      const [live, ready] = await Promise.all([
        probe("/api/healthz", signal),
        probe("/api/readyz", signal),
      ]);
      return { live, ready, at: Date.now() };
    },
    [],
    { refreshMs: 15_000, cacheKey: "health:core" },
  );
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        探测本实例 /api/healthz 与 /api/readyz
      </div>
      {[
        { k: "存活检查", v: data?.live },
        { k: "就绪检查", v: data?.ready },
      ].map((row) => (
        <div
          key={row.k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <span>{row.k}</span>
          <span>
            {loading && row.v === undefined ? "…" : row.v ? "正常" : "失败"}
          </span>
        </div>
      ))}
      <button type="button" className="wcc-btn-add" onClick={() => refresh()}>
        重新检测
      </button>
    </div>
  );
};
