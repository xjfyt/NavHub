// WIDGET-9 纯逻辑:日历网格计算 + 固定公历节日查表。
//
// 节日方案【选用 (a) 固定公历法定节日】:仅标记日期年年不变的公历节日
// (元旦/劳动节/国庆/圣诞等),数据可靠、无需任何外部依赖或农历换算;
// 春节、中秋等农历节日日期逐年变化,刻意不在此实现(避免误标),也因此
// 不再宣称做不到的农历节假日。

export interface Holiday {
  /** 0-based 月份 */
  month: number;
  /** 1-based 日期 */
  day: number;
  name: string;
}

/** 固定公历(阳历)节日,日期年年不变;不含任何农历节日。 */
export const HOLIDAYS: Holiday[] = [
  { month: 0, day: 1, name: "元旦" },
  { month: 1, day: 14, name: "情人节" },
  { month: 2, day: 8, name: "妇女节" },
  { month: 3, day: 1, name: "愚人节" },
  { month: 4, day: 1, name: "劳动节" },
  { month: 4, day: 4, name: "青年节" },
  { month: 5, day: 1, name: "儿童节" },
  { month: 8, day: 10, name: "教师节" },
  { month: 9, day: 1, name: "国庆节" },
  { month: 11, day: 25, name: "圣诞节" },
];

/** 给定年/月(0-based)返回该月天数,正确处理闰年二月。 */
export function daysInMonth(year: number, month: number): number {
  // new Date(y, m+1, 0) = 下个月第 0 天 = 本月最后一天。
  return new Date(year, month + 1, 0).getDate();
}

/** 该月 1 号是星期几(0=周日 .. 6=周六)。 */
export function weekdayOfFirst(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** 月份加减,自动处理跨年(返回归一化后的 year + 0-based month)。 */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** 查某个 0-based 月、1-based 日是否为固定公历节日;命中返回名称,否则 null。 */
export function holidayName(month: number, day: number): string | null {
  const h = HOLIDAYS.find((x) => x.month === month && x.day === day);
  return h ? h.name : null;
}

export interface CalendarCell {
  /** 显示的日期数字(1-based) */
  d: number;
  /** 是否非本月(前导/尾随补位) */
  out: boolean;
  /** 是否今天 */
  today: boolean;
  /** 本月固定公历节日名(外月格恒为 null) */
  holiday: string | null;
}

export interface TodayRef {
  year: number;
  /** 0-based */
  month: number;
  day: number;
}

/**
 * 构造 6×7=42 格的月历网格:
 * - 前导补位填上月末尾日期(out=true)
 * - 本月日期(out=false),命中固定公历节日则带 holiday
 * - 尾随补位填下月起始日期(out=true)
 * - today 仅在与传入 today 同年同月同日时标记(且必落在本月格)
 */
export function buildMonthGrid(
  year: number,
  month: number,
  today?: TodayRef,
): CalendarCell[] {
  const first = weekdayOfFirst(year, month);
  const dim = daysInMonth(year, month);
  const prevDim = daysInMonth(year, month === 0 ? 11 : month - 1);

  const cells: CalendarCell[] = [];

  // 前导:上月末尾若干天。
  for (let i = first; i > 0; i--) {
    cells.push({ d: prevDim - i + 1, out: true, today: false, holiday: null });
  }

  // 本月。
  for (let d = 1; d <= dim; d++) {
    const isToday =
      !!today && today.year === year && today.month === month && today.day === d;
    cells.push({ d, out: false, today: isToday, holiday: holidayName(month, d) });
  }

  // 尾随:补足到 42 格,填下月起始日期。
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ d: nextDay++, out: true, today: false, holiday: null });
  }

  return cells;
}

export const MONTH_NAMES_CN = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

/** 周日到周六的单字星期表头(日历网格列头)。 */
export const WEEKDAY_NAMES_CN = ["日", "一", "二", "三", "四", "五", "六"];
