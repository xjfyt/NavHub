// WIDGET-4 纯逻辑:播放器的下一首索引、拖拽进度换算、时间格式化、循环模式切换。
// 全部纯函数,便于单测。

export type LoopMode = "none" | "all" | "one";

export const LOOP_ORDER: LoopMode[] = ["none", "all", "one"];

/** 循环模式按 none → all → one → none 轮转。 */
export function cycleLoopMode(m: LoopMode): LoopMode {
  const i = LOOP_ORDER.indexOf(m);
  return LOOP_ORDER[(i + 1) % LOOP_ORDER.length];
}

/**
 * 计算下一首的索引。
 * @param idx     当前曲目索引;找不到时传 -1。
 * @param dir     方向:1=下一首 / -1=上一首。
 * @param len     播放列表长度。
 * @param mode    循环模式。
 * @param natural 是否“自然播放结束”触发(true 时 loop-one 重播本曲)。手动切歌传 false。
 * @returns       目标索引;若无下一首(no-loop 到达边界 / 空列表)返回 null。
 */
export function nextIndex(
  idx: number,
  dir: 1 | -1,
  len: number,
  mode: LoopMode,
  natural = false,
): number | null {
  if (len <= 0) return null;

  // 单曲循环且为自然结束 → 重播当前曲(若当前无效则落到首/末)。
  if (mode === "one" && natural) {
    return idx >= 0 ? idx : dir === 1 ? 0 : len - 1;
  }

  if (idx < 0) {
    // 当前曲不在列表中:向后从 0 开始,向前到末尾。
    return dir === 1 ? 0 : len - 1;
  }

  const raw = idx + dir;
  if (raw < 0 || raw >= len) {
    // 越界:loop-all 绕回;loop-one 的手动切歌也按循环列表绕回(单曲循环只锁
    // “自然结束”这一种情况,见上方 natural 分支);仅 no-loop 在边界停止。
    if (mode === "all" || mode === "one") return ((raw % len) + len) % len;
    return null;
  }
  return raw;
}

/** 由点击比例(0..1)换算到秒,钳在 [0, dur]。dur 无效返回 0。 */
export function seekTime(ratio: number, dur: number): number {
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  const r = Math.min(1, Math.max(0, ratio));
  return r * dur;
}

/** 秒数格式化为 m:ss;非法/负数/Infinity 回退 "0:00"。 */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
