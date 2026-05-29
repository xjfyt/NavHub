import { describe, it, expect } from "vitest";
import { remainingSeconds, advancePhase } from "./pomodoroMath";

describe("remainingSeconds", () => {
  it("根据结束时间戳与当前时间计算剩余秒数(向上取整到秒)", () => {
    const now = 1_000_000;
    expect(remainingSeconds(now + 25_000, now)).toBe(25);
    expect(remainingSeconds(now + 500, now)).toBe(1); // 不足一秒按 1 秒显示
  });

  it("超调:now > end 返回 0,不会变成负数", () => {
    const now = 1_000_000;
    expect(remainingSeconds(now - 1, now)).toBe(0);
    expect(remainingSeconds(now - 60_000, now)).toBe(0);
    expect(remainingSeconds(now, now)).toBe(0);
  });

  it("后台节流回归:挂起 N 秒后仍按真实时间算,不随 tick 漂移", () => {
    // 开始时 end = start + 25min。标签页被冻结 100 秒后才再次 tick:
    const start = 5_000_000;
    const end = start + 25 * 60 * 1000;
    // 正常情况(刚开始):
    expect(remainingSeconds(end, start)).toBe(25 * 60);
    // 后台 100 秒后唤醒(now 前进 100s),剩余应精确减少 100 秒,
    // 而非像计数器减一那样只减了几次。
    const afterBackground = start + 100_000;
    expect(remainingSeconds(end, afterBackground)).toBe(25 * 60 - 100);
    // 后台时间超过整段时长 → 钳到 0。
    const wayAfter = end + 999_999;
    expect(remainingSeconds(end, wayAfter)).toBe(0);
  });
});

describe("advancePhase", () => {
  it("work 结束切到 break,并累加一轮、给出新的结束时间戳", () => {
    const now = 2_000_000;
    const next = advancePhase("work", { workSec: 1500, breakSec: 300 }, 4, now);
    expect(next.phase).toBe("break");
    expect(next.rounds).toBe(5);
    expect(next.endTs).toBe(now + 300 * 1000);
  });

  it("break 结束切回 work,不加轮次", () => {
    const now = 2_000_000;
    const next = advancePhase("break", { workSec: 1500, breakSec: 300 }, 5, now);
    expect(next.phase).toBe("work");
    expect(next.rounds).toBe(5);
    expect(next.endTs).toBe(now + 1500 * 1000);
  });
});
