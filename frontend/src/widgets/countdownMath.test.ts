import { describe, it, expect } from "vitest";
import { parseLocalDate, countdownDays, countdownParts } from "./countdownMath";

describe("parseLocalDate", () => {
  it("按本地时区解析 YYYY-MM-DD,避免 UTC 午夜导致的差一天", () => {
    const d = parseLocalDate("2026-05-29");
    expect(d).not.toBeNull();
    // 关键:本地时区的 5 月 29 日,而非 UTC 午夜在东 8 区被读成 5 月 29 日 08:00,
    // 或在西半球被读成 5 月 28 日。getDate/getMonth 都用本地时间,必须等于配置值。
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4); // 0-based → 5 月
    expect(d!.getDate()).toBe(29);
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
    expect(d!.getSeconds()).toBe(0);
  });

  it("接受带时间后缀的字符串,只取日期部分", () => {
    const d = parseLocalDate("2026-01-01T15:30:00");
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(0);
  });

  it("非法或空输入返回 null", () => {
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate("not-a-date")).toBeNull();
    expect(parseLocalDate("2026-13-40")).toBeNull();
  });
});

describe("countdownDays", () => {
  it("down 模式:目标在未来,向上取整为剩余天数", () => {
    const now = new Date(2026, 4, 29, 10, 0, 0).getTime(); // 5/29 10:00 本地
    const r = countdownDays("2026-06-01", "down", now);
    expect(r!.days).toBe(3); // 6/1 00:00 距 5/29 10:00 不足 3 天 → ceil = 3
    expect(r!.isPast).toBe(false);
    expect(r!.label).toBe("距离");
  });

  it("down 模式:目标就是今天 → 0 天且文案为就在今天", () => {
    const now = new Date(2026, 4, 29, 23, 59, 0).getTime();
    const r = countdownDays("2026-05-29", "down", now);
    expect(r!.days).toBe(0);
    expect(r!.label).toBe("就在今天");
    expect(r!.suffix).toBe("");
  });

  it("up 模式:今天起算为 0 天,文案为今天", () => {
    const now = new Date(2026, 4, 29, 8, 0, 0).getTime();
    const r = countdownDays("2026-05-29", "up", now);
    expect(r!.days).toBe(0);
    expect(r!.label).toBe("今天");
  });

  it("up 模式:已过去的日期累计天数", () => {
    const now = new Date(2026, 4, 29, 0, 0, 0).getTime();
    const r = countdownDays("2026-05-20", "up", now);
    expect(r!.days).toBe(9);
    expect(r!.label).toBe("已过");
  });

  it("时区差一天回归:在 UTC 午夜 ISO 字符串下也按本地日判定 0 天", () => {
    // 用本地构造的“今天”当 now;只要 parseLocalDate 用了本地解析,今天就该是 0。
    const today = new Date(2026, 0, 1, 12, 0, 0);
    const r = countdownDays("2026-01-01", "down", today.getTime());
    expect(r!.days).toBe(0);
  });
});

describe("countdownParts", () => {
  it("down 模式拆分天/时/分,目标在未来", () => {
    const now = new Date(2026, 4, 29, 22, 30, 0).getTime();
    // 目标 6/1 00:00,距 5/29 22:30 = 2 天 1 小时 30 分
    const p = countdownParts("2026-06-01", "down", now);
    expect(p).not.toBeNull();
    expect(p!.days).toBe(2);
    expect(p!.hours).toBe(1);
    expect(p!.minutes).toBe(30);
    expect(p!.isPast).toBe(false);
    expect(p!.phrase).toBe("距离");
  });

  it("up 模式:已过去显示已过", () => {
    const now = new Date(2026, 4, 29, 1, 15, 0).getTime();
    const p = countdownParts("2026-05-28", "up", now);
    expect(p).not.toBeNull();
    expect(p!.days).toBe(1);
    expect(p!.hours).toBe(1);
    expect(p!.minutes).toBe(15);
    expect(p!.isPast).toBe(true);
    expect(p!.phrase).toBe("已过");
  });

  it("非法日期返回 null", () => {
    expect(countdownParts("", "down", Date.now())).toBeNull();
  });
});
