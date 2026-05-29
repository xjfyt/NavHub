import type { Tweaks, Workspace } from "../types";

/**
 * FE-4: 以不可变方式把访客本地保存的 tweaks 合并进 workspace。
 *
 * 此前 App.boot 直接 `workspace.preferences.tweaks = {...}` 原地修改了
 * 从 api.workspace() 拿到的对象(且该引用可能被 SWR 缓存共享),既可能
 * 让 React 漏掉重渲染,也会污染共享引用。这里返回一个全新的 Workspace,
 * 原始入参保持不变。
 */
export function mergeGuestTweaks(
  workspace: Workspace,
  guestTweaks: Partial<Tweaks>,
): Workspace {
  return {
    ...workspace,
    preferences: {
      ...workspace.preferences,
      tweaks: { ...workspace.preferences.tweaks, ...guestTweaks },
    },
  };
}
