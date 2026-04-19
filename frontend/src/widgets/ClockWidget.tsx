import React, { useEffect, useState } from "react";
import type { WidgetProps } from "./types";

export const ClockWidget = ({ w: _w }: WidgetProps = {}) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = now.getHours(),
    m = now.getMinutes(),
    s = now.getSeconds();
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const greeting = h < 6 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="widget w-clock">
      <div className="widget-header">
        <span className="widget-title">{greeting}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>LOCAL</span>
      </div>
      <div className="face">
        <div>
          <div>
            <span className="t">{pad(h)}:{pad(m)}</span>
            <span className="ms"> {pad(s)}</span>
          </div>
          <div className="d">{now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 · 周{weekdays[now.getDay()]}</div>
        </div>
        <div className="analog">
          <div className="dot" />
          <span style={{ transform: `translateX(-50%) rotate(${h * 30 + m * 0.5}deg)`, width: 2, height: 14, background: '#fff', position: 'absolute', left: '50%', bottom: '50%' }} />
          <span style={{ transform: `translateX(-50%) rotate(${m * 6}deg)`, width: 1.5, height: 20, background: '#ffd7a5', position: 'absolute', left: '50%', bottom: '50%' }} />
        </div>
      </div>
    </div>
  );
};

const ZONES: { tz: string; label: string }[] = [
  { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: "本地" },
  { tz: "UTC", label: "UTC" },
  { tz: "Asia/Tokyo", label: "东京" },
  { tz: "America/New_York", label: "纽约" },
  { tz: "Europe/London", label: "伦敦" },
  { tz: "Europe/Paris", label: "巴黎" },
];

export const ClockDetail = (_props: WidgetProps = {}) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          {now.toLocaleTimeString("zh-CN", { hour12: false })}
        </div>
        <div style={{ marginTop: 6, color: "var(--text-soft)", fontSize: 13 }}>
          {now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {ZONES.map((z) => (
          <div key={z.tz} style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-soft)", marginBottom: 4 }}>{z.label}</div>
            <div style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
              {now.toLocaleTimeString("zh-CN", { hour12: false, timeZone: z.tz })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
