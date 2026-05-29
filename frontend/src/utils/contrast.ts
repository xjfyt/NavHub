// A11Y-8:WCAG 对比度计算的纯逻辑。
// 用于审计静音文本(--text-mute 等)在其背景上的对比度是否满足 WCAG AA
// (正文 4.5:1,大字号 3:1)。所有函数都是纯函数,便于单元测试。

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

/** 把 #rgb / #rrggbb 解析为 0-255 的 RGB。非法输入抛错。 */
export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * 把半透明前景 fg(带 alpha 0-1)合成到不透明背景 bg 上,返回合成后的不透明色。
 * 标准 source-over alpha 混合:out = fg*a + bg*(1-a)。
 */
export function composite(fg: RGBA, bg: RGB): RGB {
  const a = Math.max(0, Math.min(1, fg.a));
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

/** sRGB 单通道(0-255)转线性值,用于相对亮度计算(WCAG 2.x 公式)。 */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 相对亮度(WCAG 2.x):0(黑)~ 1(白)。 */
export function relativeLuminance(c: RGB): number {
  return (
    0.2126 * channelLuminance(c.r) +
    0.7152 * channelLuminance(c.g) +
    0.0722 * channelLuminance(c.b)
  );
}

/**
 * 两个不透明颜色之间的 WCAG 对比度:(L1 + 0.05) / (L2 + 0.05),L1 为较亮者。
 * 入参为 #rgb / #rrggbb 字符串。黑/白 = 21:1。
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 把 RGB 转回 #rrggbb(小写),便于把合成结果喂给 contrastRatio。 */
export function rgbToHex(c: RGB): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
