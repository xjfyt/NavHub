export const DEFAULT_ICON_COLORS = [
  { bg: "linear-gradient(135deg, #ff6b6b, #e84444)", name: "red" },
  { bg: "linear-gradient(135deg, #4facfe, #00c6fb)", name: "blue" },
  { bg: "linear-gradient(135deg, #43e97b, #38f9d7)", name: "green" },
  { bg: "linear-gradient(135deg, #fa709a, #fee140)", name: "peach" },
  { bg: "linear-gradient(135deg, #a18cd1, #fbc2eb)", name: "lavender" },
  { bg: "linear-gradient(135deg, #f6d365, #fda085)", name: "orange" },
  { bg: "linear-gradient(135deg, #667eea, #764ba2)", name: "indigo" },
  { bg: "linear-gradient(135deg, #30cfd0, #330867)", name: "teal" },
  { bg: "linear-gradient(135deg, #1f1c2c, #928dab)", name: "steel" },
  { bg: "linear-gradient(135deg, #f093fb, #f5576c)", name: "pink" },
  { bg: "linear-gradient(135deg, #89f7fe, #66a6ff)", name: "sky" },
  { bg: "linear-gradient(135deg, #a8edea, #fed6e3)", name: "mist" },
  { bg: "linear-gradient(135deg, #c2e59c, #64b3f4)", name: "leaf" },
  { bg: "conic-gradient(from 180deg at 50% 50%, #ff6b6b, #fee140, #38f9d7, #4facfe, #a18cd1, #ff6b6b)", name: "palette" },
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
