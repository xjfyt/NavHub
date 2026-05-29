// WIDGET-5 纯逻辑:时钟的中文问候与可配置时区 / 12-24 小时制格式化。

/** 按小时(0-23)返回中文问候语。 */
export function greetingByHour(h: number): string {
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export interface ClockFormatOptions {
  hour12: boolean;
  /** IANA 时区名,如 "Asia/Tokyo";留空用本地时区。 */
  timeZone?: string;
  /** 是否显示秒。 */
  seconds: boolean;
}

/**
 * 用 Intl.DateTimeFormat 按指定时区与 12/24 小时制格式化时间。
 * 抽成纯函数便于单测(注入固定 Date + 时区,断言不依赖运行环境本地时区)。
 */
export function formatClock(date: Date, opts: ClockFormatOptions): string {
  const fmtOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: opts.hour12,
  };
  if (opts.seconds) fmtOpts.second = "2-digit";
  if (opts.timeZone) fmtOpts.timeZone = opts.timeZone;
  return new Intl.DateTimeFormat("zh-CN", fmtOpts).format(date);
}

/** 给定时区下取“小时”(0-23),供问候语使用;留空用本地。 */
export function hourInZone(date: Date, timeZone?: string): number {
  if (!timeZone) return date.getHours();
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value;
  // hour12:false 在某些实现里午夜会给出 "24",归一到 0。
  const n = h ? Number(h) % 24 : date.getHours();
  return Number.isFinite(n) ? n : date.getHours();
}
