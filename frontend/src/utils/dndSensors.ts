// @dnd-kit 传感器激活约束（activation constraint）—— 抽成纯常量便于单测,
// 并让 NavView 的传感器装配保持一行。
//
// 设计:
//   - 鼠标:沿用原 PointerSensor 的 distance:4,指针移动 4px 即开始拖动,
//     鼠标体验与改造前完全一致。
//   - 触摸:用「长按」激活——按住 ~220ms 才进入拖拽。这样手指轻点(打开图标)、
//     滑动(翻页/滚动)都不会误触发拖拽,只有刻意长按才进入排序模式;
//     tolerance:8 允许长按期间手指轻微抖动而不取消。
//
// 配合 CSS:.nav-cell 不再全局 touch-action:none(那会吞掉触摸滚动),
// 只在拖拽进行中(.nav-cell.is-dragging)与拖拽预览上禁用 touch-action。

export interface MouseActivationConstraint {
  distance: number;
}

export interface TouchActivationConstraint {
  delay: number;
  tolerance: number;
}

// QUAL-14: 把传感器激活阈值从内联字面量提为命名常量,使其含义自解释、便于统一调参。
/** 鼠标:指针移动达到该像素数即开始拖动。 */
export const MOUSE_ACTIVATION_DISTANCE_PX = 4;
/** 触摸:需长按这么久(ms)才进入拖拽,避免轻点/滑动误触。 */
export const TOUCH_LONG_PRESS_DELAY_MS = 220;
/** 触摸:长按期间允许的手指抖动容差(px),超出则取消长按。 */
export const TOUCH_LONG_PRESS_TOLERANCE_PX = 8;

export const mouseActivationConstraint: MouseActivationConstraint = {
  distance: MOUSE_ACTIVATION_DISTANCE_PX,
};

export const touchActivationConstraint: TouchActivationConstraint = {
  delay: TOUCH_LONG_PRESS_DELAY_MS,
  tolerance: TOUCH_LONG_PRESS_TOLERANCE_PX,
};
