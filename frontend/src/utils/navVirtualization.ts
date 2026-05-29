// PERF-7: 大分类(单元格很多)的渲染优化判定。
//
// 背景：分类内图标/小组件全部渲染成 .nav-cell。分类很大(>150 项)时，即使大部分
// 单元格在视口之外，浏览器仍要对每一格做布局/绘制，首屏渲染与滚动都被拖慢。
//
// 方案(零依赖、零 JS、对 dnd 安全)：给网格加 content-visibility: auto +
// contain-intrinsic-size，让浏览器跳过【离屏】单元格的渲染/布局/绘制，但 DOM 元素
// 依旧存在——dnd-kit 的注册、碰撞检测、<a> 磁贴、合并几何、键盘焦点顺序全部不受影响。
//
// 小网格不需要这层优化(内容可见性切换本身也有微小成本)，因此用一个阈值门控：
// 仅当项数 ≥ 阈值时才在网格上加启用类。该判定抽成纯函数便于单测。
//
// content-visibility 的已知注意点(均不影响本场景的正确性，仅记录)：
//   • Ctrl+F「页内查找」对 content-visibility: auto 的离屏内容仍可命中(规范要求 UA
//     在 find-in-page 时把相关子树视为可见)，所以查找不受影响。
//   • 离屏单元格被跳过渲染时其高度由 contain-intrinsic-size 占位，故滚动条长度与
//     滚动锚定保持稳定；滚入视口时浏览器立即给出真实布局盒，合并几何(getBoundingClientRect)
//     能拿到正确矩形。拖拽中被拖磁贴始终在屏，DragOverlay 单独渲染，均不被跳过。

/** PERF-7：判定为「大分类」并启用 content-visibility 的项数阈值。 */
export const NAV_CONTENT_VISIBILITY_THRESHOLD = 150;

/**
 * 当前分类的网格项数是否大到需要启用 content-visibility 优化。
 * 仅当项数 ≥ 阈值时返回 true；对 NaN / 负数等非法值兜底为 false。
 */
export function shouldUseContentVisibility(count: number): boolean {
  if (!Number.isFinite(count)) return false;
  return count >= NAV_CONTENT_VISIBILITY_THRESHOLD;
}
