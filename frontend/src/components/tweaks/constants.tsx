import { navIcons } from "../TweaksPanelParts";

/**
 * TweaksPanel 各下拉/导航的静态选项数据。原先这些数组在组件体内逐次重建，
 * 这里上提到模块作用域共享，取值完全一致（纯数据搬运，无行为变化）。
 */

export const sidebarOpts = [
  { id: "autohide", name: "自动隐藏" },
  { id: "pinned", name: "一直显示" },
  { id: "hidden", name: "一直隐藏" },
];

export const sidebarPosOpts = [
  { id: "left", name: "左侧" },
  { id: "right", name: "右侧" },
];

export const openOpts = [
  { id: "newtab", name: "新标签页" },
  { id: "current", name: "当前标签页" },
];

export const iconSizeOpts = [
  { id: "auto", name: "自动" },
  { id: "lg", name: "大" },
  { id: "md", name: "中" },
  { id: "sm", name: "小" },
];

export const modeOpts = [
  { id: "light", name: "浅色" },
  { id: "dark", name: "深色" },
  { id: "auto", name: "跟随系统" },
];

export const navItems = [
  { id: "general", icon: navIcons.general, label: "常规设置" },
  { id: "wallpaper", icon: navIcons.wallpaper, label: "背景与壁纸" },
  { id: "search", icon: navIcons.search, label: "搜索引擎" },
  { id: "notify", icon: navIcons.notify, label: "消息通知" },
  { id: "about", icon: navIcons.about, label: "关于我们" },
];

// UX-9: 版本号由构建时注入的 __APP_VERSION__ 提供（来自 package.json），不硬编码。
export const ABOUT_PROJECT_URL = "https://github.com/xjfyt/NavHub";
