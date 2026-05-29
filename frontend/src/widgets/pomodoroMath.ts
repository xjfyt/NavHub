// WIDGET-3 纯逻辑:番茄钟改为“时间戳驱动”。
// 之前每秒 remaining-- 在标签页被后台节流时会漂移(浏览器把 1s interval
// 压成几秒甚至冻结)。改为存目标结束时间戳 endTs,每次 tick 用
// remaining = ceil((endTs - now) / 1000) 重新计算,后台多久都不会失准。

export type Phase = "work" | "break";

/** 由结束时间戳与当前时间得到剩余秒数,钳在 [0, ∞)。now 可注入便于测试。 */
export function remainingSeconds(endTs: number, now: number): number {
  const ms = endTs - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

export interface PhaseDurations {
  workSec: number;
  breakSec: number;
}

export interface NextPhase {
  phase: Phase;
  rounds: number;
  endTs: number;
}

/**
 * 当前阶段计时结束后,切换到下一阶段并给出新的结束时间戳。
 * work→break 记一轮完成;break→work 不加轮次。now 可注入便于测试。
 */
export function advancePhase(
  phase: Phase,
  dur: PhaseDurations,
  rounds: number,
  now: number,
): NextPhase {
  if (phase === "work") {
    return {
      phase: "break",
      rounds: rounds + 1,
      endTs: now + dur.breakSec * 1000,
    };
  }
  return { phase: "work", rounds, endTs: now + dur.workSec * 1000 };
}
