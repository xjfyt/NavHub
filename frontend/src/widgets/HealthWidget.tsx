import { useRef } from "react";
import { useWidgetData } from "../hooks/useWidgetData";
import { formatLastOk, formatLatencyMs } from "./healthFormat";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";

interface Probe {
  ok: boolean;
  ms: number;
}

async function probe(path: string, signal?: AbortSignal): Promise<Probe> {
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const res = await fetch(path, {
      signal,
      credentials: "include",
      cache: "no-store",
    });
    const ms =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      t0;
    return { ok: res.ok, ms };
  } catch {
    const ms =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      t0;
    return { ok: false, ms };
  }
}

type HealthSnap = {
  live: Probe;
  ready: Probe;
  at: number;
};

function pickLatency(snap: HealthSnap | null): number | null {
  if (!snap) return null;
  const parts = [snap.live.ms, snap.ready.ms].filter((n) => Number.isFinite(n));
  if (parts.length === 0) return null;
  return Math.max(...parts);
}

export const HealthWidget = ({ w }: WidgetProps = {}) => {
  const tier = widgetTier(w?.wSpan, w?.wRow);
  const lastOkRef = useRef<number | null>(null);
  const { data, loading } = useWidgetData(
    async (signal) => {
      const [live, ready] = await Promise.all([
        probe("/api/healthz", signal),
        probe("/api/readyz", signal),
      ]);
      return { live, ready, at: Date.now() } satisfies HealthSnap;
    },
    [],
    { refreshMs: 30_000, cacheKey: "health:core" },
  );
  if (data?.live.ok && data?.ready.ok) lastOkRef.current = data.at;
  const live = data?.live.ok;
  const ready = data?.ready.ok;
  const ok = live && ready;
  const word = loading && !data ? "检测中" : ok ? "在线" : "降级";
  const latency = pickLatency(data);
  return (
    <div className="widget w-health">
      <div className="widget-header">
        <span className="widget-title">系统状态</span>
        <span className="muted" style={{ fontSize: 10 }}>
          {loading && !data
            ? "检测中"
            : latency != null
              ? formatLatencyMs(latency)
              : ok
                ? "正常"
                : "需关注"}
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
          <div className="health-row">
            <span>上次正常</span>
            <span>
              {lastOkRef.current
                ? formatLastOk(lastOkRef.current)
                : loading
                  ? "…"
                  : "尚无"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export const HealthDetail = ({ w }: WidgetProps = {}) => {
  void w;
  const lastOkRef = useRef<number | null>(null);
  const { data, loading, refresh } = useWidgetData(
    async (signal) => {
      const [live, ready] = await Promise.all([
        probe("/api/healthz", signal),
        probe("/api/readyz", signal),
      ]);
      return { live, ready, at: Date.now() } satisfies HealthSnap;
    },
    [],
    { refreshMs: 15_000, cacheKey: "health:core" },
  );
  if (data?.live.ok && data?.ready.ok) lastOkRef.current = data.at;
  const latency = pickLatency(data);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        探测本实例是否存活、能否提供服务。延迟取两次探测中较慢的一次。
      </div>
      {[
        {
          k: "存活",
          v: data?.live.ok,
          extra: data ? formatLatencyMs(data.live.ms) : "",
        },
        {
          k: "就绪",
          v: data?.ready.ok,
          extra: data ? formatLatencyMs(data.ready.ms) : "",
        },
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
            {loading && row.v === undefined
              ? "…"
              : row.v
                ? `正常 · ${row.extra}`
                : "失败"}
          </span>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <span>整体延迟</span>
        <span>{latency != null ? formatLatencyMs(latency) : "—"}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <span>上次正常</span>
        <span>
          {lastOkRef.current ? formatLastOk(lastOkRef.current) : "尚无"}
        </span>
      </div>
      <button type="button" className="wcc-btn-add" onClick={() => refresh()}>
        重新检测
      </button>
    </div>
  );
};
