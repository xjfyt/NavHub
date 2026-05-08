import { useEffect, useState } from "react";
import type { WidgetProps } from "./types";

function getYearStats(now: Date) {
  const year = now.getFullYear();
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const dayMs = 86_400_000;
  const elapsedDays = Math.floor((now.getTime() - start) / dayMs) + 1;
  const totalDays = Math.round((end - start) / dayMs);
  const progress = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  return {
    year,
    elapsedDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    totalDays,
    progress,
  };
}

export const YearProgressWidget = (_props: WidgetProps = {}) => {
  const [stats, setStats] = useState(() => getYearStats(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setStats(getYearStats(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const pct = (stats.progress * 100).toFixed(1);

  return (
    <div className="widget w-year-progress">
      <div className="widget-header">
        <span className="widget-title">{stats.year} 进度</span>
        <span className="muted mono" style={{ fontSize: 10 }}>DAY {stats.elapsedDays}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 34,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {pct}
        </span>
        <span style={{ fontSize: 16, color: "var(--text-soft)" }}>%</span>
      </div>
      <div
        style={{
          marginTop: 12,
          height: 8,
          borderRadius: 4,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #7bd88f, #6fb1ff)",
            transition: "width 600ms ease",
          }}
        />
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-soft)", display: "flex", justifyContent: "space-between" }}>
        <span>已过 {stats.elapsedDays} 天</span>
        <span>还剩 {stats.remainingDays} 天</span>
      </div>
    </div>
  );
};

function getScoped(now: Date) {
  const year = now.getFullYear(), month = now.getMonth(), date = now.getDate();
  const yStart = new Date(year, 0, 1).getTime();
  const yEnd = new Date(year + 1, 0, 1).getTime();
  const mStart = new Date(year, month, 1).getTime();
  const mEnd = new Date(year, month + 1, 1).getTime();
  const dow = now.getDay(); // 0..6, 0=Sun — treat Monday as start
  const offsetToMon = (dow + 6) % 7;
  const wStart = new Date(year, month, date - offsetToMon).setHours(0, 0, 0, 0);
  const wEnd = wStart + 7 * 86400_000;
  const dStart = new Date(year, month, date).setHours(0, 0, 0, 0);
  const dEnd = dStart + 86400_000;
  const t = now.getTime();
  const pct = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  return {
    year: pct(yStart, yEnd),
    month: pct(mStart, mEnd),
    week: pct(wStart, wEnd),
    day: pct(dStart, dEnd),
  };
}

export const YearProgressDetail = (_props: WidgetProps = {}) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const s = getScoped(now);
  const rows: Array<{ label: string; p: number; color: string }> = [
    { label: "今年", p: s.year, color: "linear-gradient(90deg, #7bd88f, #6fb1ff)" },
    { label: "本月", p: s.month, color: "linear-gradient(90deg, #ff9b7b, #ffb86b)" },
    { label: "本周", p: s.week, color: "linear-gradient(90deg, #a78bfa, #60a5fa)" },
    { label: "今天", p: s.day, color: "linear-gradient(90deg, #f472b6, #fb7185)" },
  ];
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span>{r.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{(r.p * 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ width: `${r.p * 100}%`, height: "100%", background: r.color, transition: "width 600ms ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
};
