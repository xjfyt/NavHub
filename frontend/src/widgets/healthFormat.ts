/** 健康探测展示：延迟与「上次正常」相对时间。 */

export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatLastOk(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const d = now - ts;
  if (d < 15_000) return "刚刚";
  if (d < 60_000) return `${Math.max(1, Math.floor(d / 1000))} 秒前`;
  if (d < 3_600_000) return `${Math.max(1, Math.floor(d / 60_000))} 分钟前`;
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
