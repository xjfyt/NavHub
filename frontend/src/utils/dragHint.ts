// UX-19: 拖拽手势「首次引导」相关纯逻辑。
//
// 背景：图标网格藏了好几个不显眼的手势——拖动可重新排序、拖到侧边栏分类可移动到
// 另一个分类、触摸端长按才进入拖拽、把一张图标深压到另一张上会合并成文件夹。新用户
// 根本不知道这些，发现成本很高。
//
// 方案：在网格上方放一条「轻量、可关闭」的引导提示行，只对「能编辑且有内容」的用户、
// 且本人尚未关闭过时展示；关闭状态持久化在 localStorage(与 firstRun.ts 同一套做法)，
// 老用户不再被打扰。
//
// 把「是否应展示」抽成纯函数 → 布尔，便于单测：
//   - 访客 / 只读分类(不可编辑)        → 不展示(没法拖，提示无意义)
//   - 空分类(没有任何图标/组件)        → 不展示(没东西可拖)
//   - 用户已手动关闭                   → 不展示
//   - 可编辑 + 有内容 + 未关闭         → 展示

export interface DragHintInput {
  /** 当前用户能否在当前分类做写操作(非访客 + 分类可编辑)。 */
  editable: boolean;
  /** 当前分类是否有可拖拽的内容(icon / widget 至少一个)。 */
  hasContent: boolean;
  /** 用户是否已手动关闭过该提示(持久化在 localStorage)。 */
  dismissed: boolean;
}

export function shouldShowDragHint(input: DragHintInput): boolean {
  if (!input.editable) return false;
  if (!input.hasContent) return false;
  if (input.dismissed) return false;
  return true;
}

/** localStorage key：记录用户已关闭拖拽手势引导。 */
export const DRAG_HINT_DISMISSED_KEY = "navhub_drag_hint_dismissed";

export function readDragHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(DRAG_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistDragHintDismissed(): void {
  try {
    window.localStorage.setItem(DRAG_HINT_DISMISSED_KEY, "1");
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
