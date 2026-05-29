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

export const mouseActivationConstraint: MouseActivationConstraint = {
  distance: 4,
};

export const touchActivationConstraint: TouchActivationConstraint = {
  delay: 220,
  tolerance: 8,
};
