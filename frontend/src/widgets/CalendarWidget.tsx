import React, { useState } from "react";
import { Icon } from "../components/Icon";
import type { WidgetProps } from "./types";

export const CalendarWidget = (_props: WidgetProps = {}) => {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear(), mo = month.getMonth();
  const first = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const prevDays = new Date(year, mo, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = first; i > 0; i--) cells.push({ d: prevDays - i + 1, out: true });
  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = today.getFullYear() === year && today.getMonth() === mo && today.getDate() === i;
    cells.push({ d: i, today: isToday });
  }
  while (cells.length < 42) cells.push({ d: cells.length - daysInMonth - first + 1, out: true });
  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  return (
    <div className="widget w-calendar">
      <div className="cal-head">
        <div>
          <div className="cal-month">{year} · {monthNames[mo]}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{today.toLocaleDateString('zh-CN', { weekday: 'long' })}</div>
        </div>
        <div className="cal-nav">
          <button onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mo - 1, 1)); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="chevron-left" size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); setMonth(new Date()); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="star" size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mo + 1, 1)); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="chevron-right" size={12} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {"日一二三四五六".split("").map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((c, i) => (
          <div key={i} className={"cal-day" + (c.out ? " out" : "") + (c.today ? " today" : "")}>{c.d}</div>
        ))}
      </div>
    </div>
  );
};

export const CalendarDetail = (_props: WidgetProps = {}) => {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear(), mo = month.getMonth();
  const first = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const prevDays = new Date(year, mo, 0).getDate();
  const today = new Date();
  const cells: Array<{ d: number; out?: boolean; today?: boolean }> = [];
  for (let i = first; i > 0; i--) cells.push({ d: prevDays - i + 1, out: true });
  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = today.getFullYear() === year && today.getMonth() === mo && today.getDate() === i;
    cells.push({ d: i, today: isToday });
  }
  while (cells.length < 42) cells.push({ d: cells.length - daysInMonth - first + 1, out: true });
  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{year} · {monthNames[mo]}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            今天：{today.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={() => setMonth(new Date(year, mo - 1, 1))}><Icon name="chevron-left" size={12} /></button>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={() => setMonth(new Date())}>今天</button>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={() => setMonth(new Date(year, mo + 1, 1))}><Icon name="chevron-right" size={12} /></button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {"日一二三四五六".split("").map((d) => (
          <div key={d} className="muted" style={{ textAlign: "center", fontSize: 11, padding: 6 }}>{d}</div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              padding: "12px 0",
              fontSize: 14,
              borderRadius: 8,
              opacity: c.out ? 0.3 : 1,
              background: c.today ? "var(--accent)" : "rgba(255,255,255,0.03)",
              color: c.today ? "#000" : "inherit",
              fontWeight: c.today ? 700 : 400,
            }}
          >{c.d}</div>
        ))}
      </div>
    </div>
  );
};
