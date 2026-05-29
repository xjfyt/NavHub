import { useEffect, useState } from "react";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { formatClock, greetingByHour, hourInZone } from "./clockFormat";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";

interface ClockConfig {
  /** IANA 时区名;留空使用本地时区。 */
  timeZone?: string;
  /** 是否使用 12 小时制(默认 false = 24 小时制)。 */
  hour12?: boolean;
}

const DEFAULTS: ClockConfig = { hour12: false };

/** 可选世界时区(label 用于 detail 多时区面板与编辑器下拉)。 */
export const CLOCK_ZONES: { tz: string; label: string }[] = [
  { tz: "", label: "本地" },
  { tz: "UTC", label: "UTC" },
  { tz: "Asia/Shanghai", label: "北京" },
  { tz: "Asia/Tokyo", label: "东京" },
  { tz: "America/New_York", label: "纽约" },
  { tz: "America/Los_Angeles", label: "洛杉矶" },
  { tz: "Europe/London", label: "伦敦" },
  { tz: "Europe/Paris", label: "巴黎" },
];

export const ClockWidget = ({ w }: WidgetProps<ClockConfig> = {}) => {
  const { config } = useWidgetConfig<ClockConfig>(w, DEFAULTS);
  const hour12 = config.hour12 ?? false;
  const timeZone = config.timeZone || undefined;
  // WIDGET-7: 小尺寸隐藏模拟表盘、收敛日期为短格式,避免溢出/裁切。
  const tier = widgetTier(w?.wSpan, w?.wRow);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = hourInZone(now, timeZone);
  const greeting = greetingByHour(h);
  const timeStr = formatClock(now, { hour12, timeZone, seconds: true });

  // 日期/星期按所选时区显示(本地时区直接用 Date 取值)。
  // 小尺寸用短格式(月/日 周X),避免「2026 年 5 月 29 日 星期五」过长换行。
  const dateStr = new Intl.DateTimeFormat("zh-CN", {
    ...(tier === "sm"
      ? { month: "numeric", day: "numeric", weekday: "short" }
      : { year: "numeric", month: "long", day: "numeric", weekday: "long" }),
    ...(timeZone ? { timeZone } : {}),
  }).format(now);

  // 模拟指针仍按所选时区的时/分。
  const m = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(now);
    return Number(
      parts.find((p) => p.type === "minute")?.value ?? now.getMinutes(),
    );
  })();

  const zoneLabel = !timeZone
    ? "LOCAL"
    : (CLOCK_ZONES.find((z) => z.tz === timeZone)?.label ?? timeZone);

  return (
    <div className="widget w-clock">
      <div className="widget-header">
        <span className="widget-title">{greeting}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {zoneLabel}
        </span>
      </div>
      <div className="face">
        <div>
          <div>
            <span className="t">{timeStr}</span>
          </div>
          <div className="d">{dateStr}</div>
        </div>
        {tier !== "sm" && (
          <div className="analog">
            <div className="dot" />
            <span
              style={{
                transform: `translateX(-50%) rotate(${(h % 12) * 30 + m * 0.5}deg)`,
                width: 2,
                height: 14,
                background: "#fff",
                position: "absolute",
                left: "50%",
                bottom: "50%",
              }}
            />
            <span
              style={{
                transform: `translateX(-50%) rotate(${m * 6}deg)`,
                width: 1.5,
                height: 20,
                background: "#ffd7a5",
                position: "absolute",
                left: "50%",
                bottom: "50%",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ClockDetail = ({ w }: WidgetProps<ClockConfig> = {}) => {
  const { config } = useWidgetConfig<ClockConfig>(w, DEFAULTS);
  const hour12 = config.hour12 ?? false;
  const primaryTz = config.timeZone || undefined;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const primaryLabel = !primaryTz
    ? "本地"
    : (CLOCK_ZONES.find((z) => z.tz === primaryTz)?.label ?? primaryTz);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatClock(now, { hour12, timeZone: primaryTz, seconds: true })}
        </div>
        <div style={{ marginTop: 6, color: "var(--text-soft)", fontSize: 13 }}>
          {greetingByHour(hourInZone(now, primaryTz))} · {primaryLabel} ·{" "}
          {new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
            ...(primaryTz ? { timeZone: primaryTz } : {}),
          }).format(now)}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        {CLOCK_ZONES.filter((z) => z.tz !== "").map((z) => (
          <div
            key={z.tz}
            style={{
              padding: 10,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-soft)",
                marginBottom: 4,
              }}
            >
              {z.label}
            </div>
            <div style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
              {formatClock(now, { hour12, timeZone: z.tz, seconds: false })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
