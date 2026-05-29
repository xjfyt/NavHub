import { useEffect, useState } from "react";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { countdownDays, countdownParts } from "./countdownMath";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";

interface CountdownConfig {
  title?: string;
  targetDate?: string;
  mode?: "up" | "down";
}

const DEFAULTS: CountdownConfig = { mode: "down" };

function formatDateCn(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/**
 * 低频时钟:磁贴按天显示,每分钟刷新一次即可让“距离 N 天”跨过午夜后更新;
 * 详情显示到分钟,同样每分钟刷新。卸载时清理。
 */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export const CountdownWidget = ({ w }: WidgetProps<CountdownConfig> = {}) => {
  const { config } = useWidgetConfig<CountdownConfig>(w, DEFAULTS);
  const mode = config.mode ?? "down";
  const now = useMinuteTick();
  const result = countdownDays(config.targetDate, mode, now);
  // WIDGET-7: 小尺寸隐藏底部日期行,只留天数 + 标签,避免四行堆叠溢出胶囊。
  const tier = widgetTier(w?.wSpan, w?.wRow);

  if (!result) {
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

  const title = config.title?.trim() || "我的事件";
  const dateText = formatDateCn(config.targetDate!);
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
        <span className="n">{result.days.toLocaleString()}</span>
        <span className="unit">{result.suffix}</span>
      </div>
      <div className="event">{result.label}</div>
      {tier !== "sm" && <div className="date">{dateText}{dateSuffix}</div>}
    </div>
  );
};

export const CountdownDetail = ({ w }: WidgetProps<CountdownConfig> = {}) => {
  const { config } = useWidgetConfig<CountdownConfig>(w, DEFAULTS);
  const mode = config.mode ?? "down";
  const now = useMinuteTick();
  const parts = countdownParts(config.targetDate, mode, now);
  if (!parts) {
    return <div className="muted" style={{ fontSize: 13 }}>请先通过右键菜单的"编辑"设置目标日期。</div>;
  }
  const title = config.title?.trim() || "我的事件";
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{parts.phrase}</div>
        <div style={{ fontSize: 18, marginBottom: 4 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{formatDateCn(config.targetDate!)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "天", v: parts.days },
          { label: "小时", v: parts.hours },
          { label: "分钟", v: parts.minutes },
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
