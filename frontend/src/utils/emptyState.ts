// 决定 NavView 应展示哪一种引导空状态（onboarding empty state）的纯逻辑。
//
//   - "no-groups" : 整个工作区没有任何分类。
//   - "no-items"  : 有分类,但当前激活分类下没有任何 icon / widget。
//   - null        : 当前分类已有内容,不展示空状态。
//
// `editable` 不参与「显示哪种空状态」的判断——它只控制卡片里是否出现
// 「添加 / 导入」这类写操作按钮(只读分类、访客视图不应被引导去添加)。
// 把这块判断抽成纯函数便于单测,也让 NavView 渲染分支保持简单。

export type EmptyStateKind = "no-groups" | "no-items";

export interface EmptyStateInput {
  hasGroups: boolean;
  hasItems: boolean;
  editable: boolean;
}

export function pickEmptyState(input: EmptyStateInput): EmptyStateKind | null {
  if (!input.hasGroups) return "no-groups";
  if (!input.hasItems) return "no-items";
  return null;
}
