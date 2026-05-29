// A11Y-4 / UX-24: 焦点陷阱(focus trap)的纯逻辑核心。
// 把「在 N 个可聚焦元素之间循环 Tab / Shift+Tab」抽成纯函数,便于单元测试,
// DOM 层只负责收集元素列表与调用 focus(),不掺入计算逻辑。

/**
 * 给定当前聚焦元素的索引、是否按下 Shift、以及可聚焦元素总数,
 * 返回 Tab 循环后应聚焦的目标索引(带环绕)。
 *
 * 约定:
 * - count <= 0 时无可聚焦元素,返回 -1(调用方据此回退到容器本身)。
 * - currentIndex 为 -1(焦点不在陷阱内或落在容器上)时:
 *     - 正向 Tab 落到第一个(0);
 *     - 反向 Shift+Tab 落到最后一个(count - 1)。
 * - 正向到达末尾后回绕到 0;反向到达开头后回绕到 count - 1。
 */
export function nextFocusIndex(
  currentIndex: number,
  shift: boolean,
  count: number,
): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;

  if (currentIndex < 0) {
    // 焦点不在已知元素上:正向给首个,反向给末个。
    return shift ? count - 1 : 0;
  }

  if (shift) {
    return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  }
  return currentIndex >= count - 1 ? 0 : currentIndex + 1;
}

/**
 * 是否需要由 JS 接管这次 Tab(即:目标索引与浏览器默认行为不同,
 * 需要 preventDefault + 手动 focus)。
 *
 * 浏览器原生 Tab 在「不处于边界」时行为正确,只有在两端环绕、
 * 或焦点不在陷阱内时才需要接管。把判断也做成纯函数便于测试。
 */
export function shouldTrapTab(
  currentIndex: number,
  shift: boolean,
  count: number,
): boolean {
  if (count <= 0) return true; // 没有可聚焦元素,必须阻止焦点逃逸
  if (count === 1) return true; // 只有一个,Tab 永远停在它上面
  if (currentIndex < 0) return true; // 焦点在容器/未知处,需手动落点
  if (shift) return currentIndex <= 0; // 在首个上 Shift+Tab 才环绕
  return currentIndex >= count - 1; // 在末个上 Tab 才环绕
}

/**
 * A11Y-5 / UX-25:菜单(role="menu")的 roving focus 纯逻辑。
 * 给定当前高亮项索引、方向、可聚焦项总数,返回下一个应高亮的索引(带环绕)。
 *
 * 约定:
 * - count <= 0 时无可聚焦项,返回 -1。
 * - "down":向下移动,末尾环绕回 0;currentIndex < 0 时落到第一个(0)。
 * - "up":向上移动,开头环绕到末尾;currentIndex < 0 时落到最后一个(count - 1)。
 * - "home":跳到第一个(0);"end":跳到最后一个(count - 1)。
 */
export function rovingIndex(
  currentIndex: number,
  dir: "up" | "down" | "home" | "end",
  count: number,
): number {
  if (count <= 0) return -1;
  if (dir === "home") return 0;
  if (dir === "end") return count - 1;
  if (count === 1) return 0;

  if (currentIndex < 0) {
    return dir === "up" ? count - 1 : 0;
  }
  if (dir === "up") {
    return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  }
  return currentIndex >= count - 1 ? 0 : currentIndex + 1;
}

// 收集容器内可聚焦元素时使用的选择器(供 DOM 层复用,保持单一来源)。
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
].join(",");
