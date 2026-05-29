import { DEFAULT_ICON_COLORS } from "../constants/design";

export type IconColor = (typeof DEFAULT_ICON_COLORS)[number];

/**
 * FE-9: 安全地把任意颜色下标(可能为负、NaN、超界或 undefined)夹取到
 * DEFAULT_ICON_COLORS 的合法范围内,始终返回一个确定存在的颜色对象。
 *
 * 之前各处写法是 `DEFAULT_ICON_COLORS[c % len] || DEFAULT_ICON_COLORS[0]`,
 * 对负数 / NaN 依赖 `|| fallback` 兜底,既脆弱又重复。这里统一为可单测的纯函数。
 */
export function safeIconColor(index: number | null | undefined): IconColor {
  const len = DEFAULT_ICON_COLORS.length;
  const n = Number(index);
  if (!Number.isFinite(n)) return DEFAULT_ICON_COLORS[0];
  // 先取整,再用 ((x % len) + len) % len 把负数也映射进 [0, len) 区间。
  const i = ((Math.trunc(n) % len) + len) % len;
  return DEFAULT_ICON_COLORS[i];
}
