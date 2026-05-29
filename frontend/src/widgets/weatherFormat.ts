// WIDGET-6 纯逻辑:天气温度单位换算(°C↔°F)与「未设置城市」空态判定。
//
// 后端(Open-Meteo / 和风)固定返回摄氏度,温度被格式化进字符串里,如:
//   temp:   "23°"
//   cond:   "☀️ 晴 · 体感 21°"
//   hours[].t: "22°"
// 因此 °F 切换完全在【客户端展示层】完成:把字符串里的温度数字换算后再渲染,
// 无需后端配合(若未来要按用户单位返回原始数值再做单位本地化,才需要后端改动)。

export type TempUnit = "c" | "f";

/** 摄氏转华氏(保留小数,调用方自行四舍五入)。 */
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

/**
 * 把字符串中所有「紧跟度数符号 ° 的数值」按目标单位换算。
 * - unit === "c":原样返回(后端本就是摄氏)。
 * - unit === "f":匹配 `-?数字°`,逐个换算为华氏并四舍五入。
 * 只匹配带 ° 的数字,因此湿度 "60%"、风向 "东南风"、AQI "75" 不受影响。
 */
export function convertTempString(s: string | undefined | null, unit: TempUnit): string {
  if (!s) return "";
  if (unit === "c") return s;
  // 匹配可选负号 + 整数/小数,后跟度数符号 °。
  return s.replace(/-?\d+(?:\.\d+)?(?=°)/g, (m) => {
    const c = Number(m);
    if (!Number.isFinite(c)) return m;
    return String(Math.round(celsiusToFahrenheit(c)));
  });
}

/**
 * 是否应展示「未设置城市」引导空态。
 * - 已配置城市 → 否(交由数据/加载/错误态处理)。
 * - 未配置城市但后端已按 IP 兜底返回了数据 → 否(直接展示该数据)。
 * - 未配置城市且无数据 → 是(给出明确设置引导,避免空白/损坏外观)。
 */
export function shouldShowWeatherSetup(
  city: string | undefined | null,
  hasData: boolean,
): boolean {
  const hasCity = !!(city ?? "").trim();
  if (hasCity) return false;
  return !hasData;
}

export const TEMP_UNIT_LABEL: Record<TempUnit, string> = {
  c: "°C",
  f: "°F",
};
