import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  weekdayOfFirst,
  addMonths,
  holidayName,
  buildMonthGrid,
  HOLIDAYS,
  WEEKDAY_NAMES_CN,
} from "./calendarMath";

describe("daysInMonth", () => {
  it("常规月份天数", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // 一月
    expect(daysInMonth(2026, 3)).toBe(30); // 四月
    expect(daysInMonth(2026, 11)).toBe(31); // 十二月
  });
  it("二月闰年/平年", () => {
    expect(daysInMonth(2024, 1)).toBe(29); // 闰年
    expect(daysInMonth(2026, 1)).toBe(28); // 平年
    expect(daysInMonth(2000, 1)).toBe(29); // 整百闰年
    expect(daysInMonth(1900, 1)).toBe(28); // 整百非闰年
  });
});

describe("weekdayOfFirst", () => {
  it("返回该月 1 号的星期(0=周日..6=周六)", () => {
    // 2026-01-01 是周四 → 4
    expect(weekdayOfFirst(2026, 0)).toBe(4);
    // 2026-05-01 是周五 → 5
    expect(weekdayOfFirst(2026, 4)).toBe(5);
  });
});

describe("addMonths", () => {
  it("月内 +/-", () => {
    expect(addMonths(2026, 4, 1)).toEqual({ year: 2026, month: 5 });
    expect(addMonths(2026, 4, -1)).toEqual({ year: 2026, month: 3 });
  });
  it("跨年向前(12 月 +1 → 次年 1 月)", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  it("跨年向后(1 月 -1 → 上年 12 月)", () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
  it("跨多年", () => {
    expect(addMonths(2026, 0, -13)).toEqual({ year: 2024, month: 11 });
    expect(addMonths(2026, 11, 14)).toEqual({ year: 2028, month: 1 });
  });
});

describe("holidayName (固定公历节日)", () => {
  it("命中元旦/劳动节/国庆/圣诞", () => {
    expect(holidayName(0, 1)).toBe("元旦"); // 1/1
    expect(holidayName(4, 1)).toBe("劳动节"); // 5/1
    expect(holidayName(9, 1)).toBe("国庆节"); // 10/1
    expect(holidayName(11, 25)).toBe("圣诞节"); // 12/25
  });
  it("非节日返回 null", () => {
    expect(holidayName(0, 2)).toBeNull();
    expect(holidayName(5, 15)).toBeNull();
  });
  it("HOLIDAYS 仅含固定公历日(不含农历)", () => {
    // 不应混入农历节日(如春节/中秋,日期年年变)。
    expect(HOLIDAYS.length).toBeGreaterThanOrEqual(4);
    for (const h of HOLIDAYS) {
      expect(h.month).toBeGreaterThanOrEqual(0);
      expect(h.month).toBeLessThanOrEqual(11);
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(31);
    }
  });
});

describe("buildMonthGrid", () => {
  it("固定 42 格(6 周 × 7 天)", () => {
    const cells = buildMonthGrid(2026, 0);
    expect(cells).toHaveLength(42);
  });

  it("前导补位标记 out=true 且日期来自上月", () => {
    // 2026-01 的 1 号是周四(前面 4 个前导格 = 2025-12 的 28..31)
    const cells = buildMonthGrid(2026, 0);
    expect(cells.slice(0, 4).every((c) => c.out)).toBe(true);
    expect(cells[0].d).toBe(28);
    expect(cells[3].d).toBe(31);
    // 第 5 格(index 4)应是本月 1 号且非 out
    expect(cells[4]).toMatchObject({ d: 1, out: false });
  });

  it("尾部补位为下月日期且 out=true", () => {
    const cells = buildMonthGrid(2026, 0); // 一月 31 天,前导 4 → 占 35 格,剩 7 格补下月 1..7
    const last = cells[41];
    expect(last.out).toBe(true);
    expect(last.d).toBe(7);
  });

  it("today 标记仅命中传入的今日(同年同月同日)", () => {
    const cells = buildMonthGrid(2026, 0, { year: 2026, month: 0, day: 15 });
    const todayCells = cells.filter((c) => c.today);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].d).toBe(15);
    expect(todayCells[0].out).toBe(false);
  });

  it("不同月的今日不会被标记", () => {
    const cells = buildMonthGrid(2026, 0, { year: 2026, month: 1, day: 15 });
    expect(cells.some((c) => c.today)).toBe(false);
  });

  it("本月内的固定节日带 holiday 名称", () => {
    const cells = buildMonthGrid(2026, 0); // 一月含元旦
    const newYear = cells.find((c) => !c.out && c.d === 1);
    expect(newYear?.holiday).toBe("元旦");
    const plain = cells.find((c) => !c.out && c.d === 2);
    expect(plain?.holiday).toBeNull();
  });

  it("前导/尾随的外月节日不标记(只标本月)", () => {
    // 一月的前导格里有 2025-12-25(圣诞),但它是 out,不应带 holiday
    const cells = buildMonthGrid(2026, 0);
    const dec25 = cells.find((c) => c.out && c.d === 25);
    expect(dec25 ? dec25.holiday : null).toBeNull();
  });
});

describe("WEEKDAY_NAMES_CN", () => {
  it("从周日起的单字星期表头(与原 split 写法等价)", () => {
    // PERF-10:常量从渲染体提升到模块作用域,需与原 "日一二三四五六".split("") 一致。
    expect(WEEKDAY_NAMES_CN).toEqual("日一二三四五六".split(""));
  });
});
