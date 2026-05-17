# 角色与权限

> 本文档是角色 / 权限矩阵的唯一权威来源。管理后台不再单独展示「角色 / 权限」页（v0.1.7+），如需对照角色行为请阅读本文。

## 四个角色

| 角色 | 来源 | 特点 |
|---|---|---|
| `superadmin` | 首次启动自动创建 + 可 SSO 绑定 | 全局唯一推荐只保留 1 个；独占 SSO 配置；可用账号密码登录 |
| `admin` | 由 superadmin 晋升 | 所有后台权限，无 SSO 配置入口 |
| `user` | 首次 SSO 登录默认 | 只能编辑自有分类；推送分类仅可改壁纸 + 侧边栏顺序 |
| `guest` | 预留（未登录匿名访问，若启用） | 只读 |

## 9 条权限位

| key | 说明 | superadmin | admin | user | guest |
|---|---|:-:|:-:|:-:|:-:|
| `view_nav` | 查看导航页 | ✅ | ✅ | ✅ | ✅ |
| `use_widgets` | 使用小组件 | ✅ | ✅ | ✅ | ❌ |
| `edit_own_nav` | 编辑自有分类/图标 | ✅ | ✅ | ✅ | ❌ |
| `reorder_sidebar` | 调整侧边栏顺序 | ✅ | ✅ | ✅ | ❌ |
| `edit_pushed_wallpaper` | 改推送分类壁纸 | ✅ | ✅ | ✅ | ❌ |
| `manage_groups` | 管理全局分类 / 推送 | ✅ | ✅ | ❌ | ❌ |
| `manage_users` | 管理用户与角色 | ✅ | ✅ | ❌ | ❌ |
| `manage_sso` | SSO 接入配置 | ✅ | ❌ | ❌ | ❌ |
| `audit_log` | 查看审计日志 | ✅ | ✅ | ❌ | ❌ |

## 登录方式矩阵

|  | 账号密码 | Casdoor SSO |
|---|:-:|:-:|
| `superadmin` | ✅ | ✅ (可绑定) |
| `admin` / `user` / `guest` | ❌ | ✅ |

超管首次 SSO 登录时，若 Casdoor 返回的 email 与 superadmin 记录匹配，则自动把 `casdoor_id` 绑定到超管账号。

## 推送分类（关键业务）

- `groups.pushed = true, owner_id = NULL` → 全局推送
- 推送分类的 icons / widgets 由后台统一维护，**所有**普通用户共享同一份布局
- 普通用户针对推送分类的个性化：
  - **壁纸**：存于 `user_preferences.pushed_group_wallpapers = { group_id: theme }`
  - **侧边栏顺序**：存于 `user_preferences.sidebar_order = [group_id, ...]`
- 取消推送：`pushed=false`，分类变成公共无主（`owner_id=NULL`），可由管理员继续维护或删除

## 后端权限实现

- 中间件 `require_login()`：注入 `User { id, role }` extension
- 宏 `require_role!(admin)`：拦截角色不足请求返回 403
- handler 内做细粒度检查（例如编辑 icon 前确认 `group.owner_id == user.id || user.role in [admin, superadmin]`）
