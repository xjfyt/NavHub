// WIDGET-7 纯逻辑:按磁贴格子尺寸(wSpan × wRow)推导信息密度档位。
//
// 三档固定尺寸(见 widgets/index.tsx):
//   small  6×3 = 18  → sm(信息最密集,需收敛二级内容、缩小字号,防溢出/裁切)
//   medium 6×6 = 36  → md(原样)
//   large  12×5 = 60 → lg(原样)
//
// 用面积分档而非硬编码精确尺寸,以兼容旧数据/异形尺寸;阈值取在三档之间留出余量:
//   area ≤ 24 → sm ; area ≥ 50 → lg ; 其余 → md
// 关键:无法判断尺寸(wRow 缺省/非法)时回落到 md,绝不误判为 sm 导致内容被裁。

export type WidgetTier = "sm" | "md" | "lg";

const SM_MAX_AREA = 24;
const LG_MIN_AREA = 50;

export function widgetTier(
  wSpan?: number | null,
  wRow?: number | null,
): WidgetTier {
  const w = wSpan ?? 0;
  const r = wRow ?? 0;
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) {
    return "md";
  }
  const area = w * r;
  if (area <= SM_MAX_AREA) return "sm";
  if (area >= LG_MIN_AREA) return "lg";
  return "md";
}
