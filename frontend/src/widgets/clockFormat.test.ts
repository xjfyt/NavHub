import { describe, it, expect } from "vitest";
import { greetingByHour, formatClock, hourInZone } from "./clockFormat";

describe("greetingByHour", () => {
  it("按小时返回中文问候(凌晨/早上/下午/晚上)", () => {
    expect(greetingByHour(0)).toBe("夜深了");
    expect(greetingByHour(5)).toBe("夜深了");
    expect(greetingByHour(6)).toBe("早上好");
    expect(greetingByHour(11)).toBe("早上好");
    expect(greetingByHour(12)).toBe("下午好");
    expect(greetingByHour(17)).toBe("下午好");
    expect(greetingByHour(18)).toBe("晚上好");
    expect(greetingByHour(23)).toBe("晚上好");
  });

  it("边界:6 点切到早上,12 点切到下午,18 点切到晚上", () => {
    expect(greetingByHour(5)).toBe("夜深了");
    expect(greetingByHour(6)).toBe("早上好");
    expect(greetingByHour(11)).toBe("早上好");
    expect(greetingByHour(12)).toBe("下午好");
    expect(greetingByHour(18)).toBe("晚上好");
  });
});

describe("formatClock", () => {
  // 用固定时刻 2026-01-01T13:05:09Z (UTC 13:05:09) 验证时区/12h-24h。
  const t = new Date(Date.UTC(2026, 0, 1, 13, 5, 9));

  it("24 小时制(UTC)显示 13:05:09", () => {
    const r = formatClock(t, { hour12: false, timeZone: "UTC", seconds: true });
    // 不同实现可能用不同分隔/空格,断言关键数字片段。
    expect(r).toContain("13");
    expect(r).toContain("05");
    expect(r).toContain("09");
  });

  it("12 小时制(UTC)显示 1 点而非 13 点", () => {
    const r = formatClock(t, { hour12: true, timeZone: "UTC", seconds: true });
    // 12 小时制下 13:05 应显示为 1 点(可能零填充为 01)且带上下午标记,绝不含 13。
    expect(r).toMatch(/0?1[:：]05/);
    expect(r).not.toContain("13");
    expect(r).toMatch(/下午|PM|pm/);
  });

  it("时区切换:东京(UTC+9)同一时刻为 22 点", () => {
    const r = formatClock(t, { hour12: false, timeZone: "Asia/Tokyo", seconds: false });
    expect(r).toContain("22");
    expect(r).toContain("05");
  });

  it("seconds=false 时不含秒(09 不出现)", () => {
    const r = formatClock(t, { hour12: false, timeZone: "UTC", seconds: false });
    expect(r).toContain("13");
    expect(r).toContain("05");
    expect(r).not.toContain("09");
  });
});

describe("hourInZone", () => {
  const t = new Date(Date.UTC(2026, 0, 1, 13, 5, 9)); // UTC 13 点
  it("按时区取小时:UTC 13 点,东京同刻 22 点", () => {
    expect(hourInZone(t, "UTC")).toBe(13);
    expect(hourInZone(t, "Asia/Tokyo")).toBe(22);
  });
  it("午夜归一:UTC 0 点返回 0 而非 24", () => {
    const midnight = new Date(Date.UTC(2026, 0, 1, 0, 30, 0));
    expect(hourInZone(midnight, "UTC")).toBe(0);
  });
});
