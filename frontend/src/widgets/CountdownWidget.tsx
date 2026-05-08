import { useWidgetConfig } from "../hooks/useWidgetConfig";
import type { WidgetProps } from "./types";

interface CountdownConfig {
  title?: string;
  targetDate?: string;
  mode?: "up" | "down";
}

const DEFAULTS: CountdownConfig = { mode: "down" };

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function formatDateCn(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

export const CountdownWidget = ({ w }: WidgetProps<CountdownConfig> = {}) => {
  const { config } = useWidgetConfig<CountdownConfig>(w, DEFAULTS);
  const mode = config.mode ?? "down";
  const target = config.targetDate ? new Date(config.targetDate).getTime() : NaN;

  if (!config.targetDate || Number.isNaN(target)) {
    return (
      <div className="widget w-countdown">
        <div className="widget-header">
          <span className="widget-title">倒计时</span>
          <span className="muted mono" style={{ fontSize: 10 }}>未设置</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          点击右键菜单的"编辑"设置事件名称和日期。
        </div>
      </div>
    );
  }

  const now = Date.now();
  const diffDays = (target - now) / MS_PER_DAY;
  let days: number;
  let label: string;
  let suffix: string;

  if (mode === "up") {
    days = Math.max(0, Math.floor((now - target) / MS_PER_DAY));
    label = days === 0 ? "今天" : "已过";
    suffix = "天";
  } else {
    const raw = Math.ceil(diffDays);
    if (raw >= 0) {
      days = raw;
      label = days === 0 ? "就在今天" : "距离";
      suffix = days === 0 ? "" : "天";
    } else {
      days = Math.abs(Math.floor(diffDays));
      label = "已过";
      suffix = "天";
    }
  }

  const title = config.title?.trim() || "我的事件";
  const dateText = formatDateCn(config.targetDate);
  const dateSuffix = mode === "up" ? "起" : "";

  return (
    <div className="widget w-countdown">
      <div className="widget-header">
        <span className="widget-title">{title}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {mode === "up" ? "SINCE" : "UNTIL"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="n">{days.toLocaleString()}</span>
        <span className="unit">{suffix}</span>
      </div>
      <div className="event">{label}</div>
      <div className="date">{dateText}{dateSuffix}</div>
    </div>
  );
};

export const CountdownDetail = ({ w }: WidgetProps<CountdownConfig> = {}) => {
  const { config } = useWidgetConfig<CountdownConfig>(w, DEFAULTS);
  const mode = config.mode ?? "down";
  const target = config.targetDate ? new Date(config.targetDate).getTime() : NaN;
  if (!config.targetDate || Number.isNaN(target)) {
    return <div className="muted" style={{ fontSize: 13 }}>请先通过右键菜单的"编辑"设置目标日期。</div>;
  }
  const now = Date.now();
  const diffMs = mode === "up" ? now - target : target - now;
  const absDays = Math.floor(Math.abs(diffMs) / MS_PER_DAY);
  const hours = Math.floor((Math.abs(diffMs) % MS_PER_DAY) / 3600_000);
  const minutes = Math.floor((Math.abs(diffMs) % 3600_000) / 60_000);
  const title = config.title?.trim() || "我的事件";
  const isPast = mode === "up" ? diffMs >= 0 : diffMs < 0;
  const phrase = isPast ? "已过" : "距离";
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{phrase}</div>
        <div style={{ fontSize: 18, marginBottom: 4 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{formatDateCn(config.targetDate)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "天", v: absDays },
          { label: "小时", v: hours },
          { label: "分钟", v: minutes },
        ].map((u) => (
          <div key={u.label} style={{ padding: "16px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{u.v}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{u.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
