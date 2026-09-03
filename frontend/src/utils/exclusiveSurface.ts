// 工作区同一时刻只应有一块「抢焦点」的浮层：组件库 / 添加图标 / 个人资料 /
// 偏好 / 右键菜单 / 用户菜单 / 搜索 / 文件夹 / 组件编辑·详情 等。
// Esc 已由各 Modal 关闭自身；这里约束「打开一块时关掉其余」，避免叠两层对话框。

export const WORKSPACE_SURFACES = [
  "catalog",
  "addIcon",
  "addCat",
  "profile",
  "tweaks",
  "iconSearch",
  "folder",
  "widgetEdit",
  "widgetDetail",
  "iframe",
  "ctx",
  "userMenu",
] as const;

export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number];

/** 打开 `keep` 时应关掉的其它浮层。 */
export function otherSurfaces(keep: WorkspaceSurface): WorkspaceSurface[] {
  return WORKSPACE_SURFACES.filter((s) => s !== keep);
}
