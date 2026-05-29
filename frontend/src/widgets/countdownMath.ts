// WIDGET-1 纯逻辑:倒计时日期解析与剩余时间计算。
// 单独抽出便于单元测试,尤其要覆盖 `new Date("2026-05-29")` 被当成 UTC 午夜
// 在本地时区出现“差一天”的回归。

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type CountdownMode = "up" | "down";

/**
 * 按【本地时区】解析配置里的日期字符串(形如 "2026-05-29" 或带时间后缀)。
 * 直接 `new Date("2026-05-29")` 会按 UTC 午夜解析,东 8 区会变成当天 08:00、
 * 西半球甚至会回退到前一天,导致显示差一天。这里手动取 y/m/d 用本地构造。
 */
export function parseLocalDate(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-based
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  // 防止 JS Date 的溢出归一化(例如 2 月 30 日 → 3 月 2 日)被当作合法值。
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

export interface CountdownDays {
  days: number;
  label: string;
  suffix: string;
  isPast: boolean;
}

/** 磁贴用:整天数 + 文案。now 可注入以便测试。 */
export function countdownDays(
  targetDate: string | null | undefined,
  mode: CountdownMode,
  now: number = Date.now(),
): CountdownDays | null {
  const d = parseLocalDate(targetDate);
  if (!d) return null;
  const target = d.getTime();

  if (mode === "up") {
    const days = Math.max(0, Math.floor((now - target) / MS_PER_DAY));
    return {
      days,
      label: days === 0 ? "今天" : "已过",
      suffix: "天",
      isPast: now >= target,
    };
  }

  const diffDays = (target - now) / MS_PER_DAY;
  const raw = Math.ceil(diffDays);
  if (raw >= 0) {
    const days = raw + 0; // 归一化 -0 → 0,避免 Object.is 比较意外

    return {
      days,
      label: days === 0 ? "就在今天" : "距离",
      suffix: days === 0 ? "" : "天",
      isPast: false,
    };
  }
  return {
    days: Math.abs(Math.floor(diffDays)),
    label: "已过",
    suffix: "天",
    isPast: true,
  };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
  phrase: string;
}

/** 详情用:把剩余/已过时间拆成天/时/分。now 可注入以便测试。 */
export function countdownParts(
  targetDate: string | null | undefined,
  mode: CountdownMode,
  now: number = Date.now(),
): CountdownParts | null {
  const d = parseLocalDate(targetDate);
  if (!d) return null;
  const target = d.getTime();
  const diffMs = mode === "up" ? now - target : target - now;
  const abs = Math.abs(diffMs);
  return {
    days: Math.floor(abs / MS_PER_DAY),
    hours: Math.floor((abs % MS_PER_DAY) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    isPast: mode === "up" ? diffMs >= 0 : diffMs < 0,
    phrase: (mode === "up" ? diffMs >= 0 : diffMs < 0) ? "已过" : "距离",
  };
}
