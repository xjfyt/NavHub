export const DEFAULT_ICON_COLORS = [
  { bg: "linear-gradient(145deg, #ef4444 0%, #b91c1c 100%)", name: "red" },
  { bg: "linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)", name: "blue" },
  { bg: "linear-gradient(145deg, #22c55e 0%, #15803d 100%)", name: "green" },
  { bg: "linear-gradient(145deg, #f97316 0%, #c2410c 100%)", name: "orange" },
  { bg: "linear-gradient(145deg, #a855f7 0%, #7e22ce 100%)", name: "purple" },
  { bg: "linear-gradient(145deg, #ec4899 0%, #be185d 100%)", name: "pink" },
  { bg: "linear-gradient(145deg, #06b6d4 0%, #0e7490 100%)", name: "cyan" },
  { bg: "linear-gradient(145deg, #eab308 0%, #a16207 100%)", name: "yellow" },
  { bg: "linear-gradient(145deg, #64748b 0%, #334155 100%)", name: "slate" },
  { bg: "linear-gradient(145deg, #84cc16 0%, #4d7c0f 100%)", name: "lime" },
  { bg: "linear-gradient(145deg, #14b8a6 0%, #0f766e 100%)", name: "teal" },
  { bg: "linear-gradient(145deg, #6366f1 0%, #4338ca 100%)", name: "indigo" },
  { bg: "linear-gradient(145deg, #f43f5e 0%, #be123c 100%)", name: "rose" },
  { bg: "conic-gradient(from 225deg at 50% 50%, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)", name: "palette" },
];

export const ROLES = [
  { id: "superadmin", label: "超级管理员 · Superadmin", desc: "全局唯一 · 独占 SSO 接入配置 · 拥有所有管理员权限" },
  { id: "admin", label: "管理员 · Admin", desc: "管理用户、分类、权限、系统设置 · 可推送分类给所有用户" },
  { id: "user", label: "普通用户 · User", desc: "可自建分类、编辑自有图标/壁纸；推送分类仅可改壁纸与侧边栏顺序" },
  { id: "guest", label: "访客 · Guest", desc: "未登录 · 只读预览 · 禁用所有编辑操作" },
];

export const PERMISSIONS = [
  { key: "view_nav", label: "查看导航页" },
  { key: "use_widgets", label: "使用小组件" },
  { key: "edit_own_nav", label: "编辑自有分类 / 图标 / 壁纸" },
  { key: "reorder_sidebar", label: "调整侧边栏顺序" },
  { key: "edit_pushed_wallpaper", label: "修改推送分类壁纸" },
  { key: "manage_groups", label: "管理全局分类 / 推送" },
  { key: "manage_users", label: "管理用户与角色" },
  { key: "manage_sso", label: "SSO 接入配置" },
  { key: "audit_log", label: "查看审计日志" },
];

export const ROLE_MATRIX: Record<string, string[]> = {
  superadmin: ["view_nav","use_widgets","edit_own_nav","reorder_sidebar","edit_pushed_wallpaper","manage_groups","manage_users","manage_sso","audit_log"],
  admin:      ["view_nav","use_widgets","edit_own_nav","reorder_sidebar","edit_pushed_wallpaper","manage_groups","manage_users","audit_log"],
  user:       ["view_nav","use_widgets","edit_own_nav","reorder_sidebar","edit_pushed_wallpaper"],
  guest:      ["view_nav"],
};
