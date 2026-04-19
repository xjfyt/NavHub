# API 规范

所有 `/api/*` 返回 JSON；错误统一格式：
```json
{ "error": "code_key", "message": "人话描述" }
```
HTTP 状态码：200/201/204 成功；400 参数错；401 未登录；403 权限不足；404 不存在；409 冲突；500 内部错误。

认证：基于 Cookie `nh_sid`（HttpOnly, Secure, SameSite=Lax）。

## 认证

### `GET /auth/login`
重定向到 Casdoor 授权端点。生成 `state` 存 Redis（TTL 5min）。

### `GET /auth/callback?code=&state=`
校验 state，用 code 换 access_token，拉 userinfo，upsert users，建 session，重定向 `/`。

### `POST /auth/password`
```json
→ { "username": "superadmin", "password": "..." }
← 204 + Set-Cookie
```
仅当目标账号 role=superadmin 时允许；其他角色返回 403 `sso_required`。

### `POST /auth/logout`
清除 Cookie，删 Redis session。

## 当前用户

### `GET /api/me`
```json
← { "id": "...", "username": "...", "email": "...", "displayName": "...",
    "avatarUrl": "...", "role": "superadmin" }
```

### `GET /api/me/preferences`
```json
← { "tweaks": { ... }, "customEngines": {...},
    "pushedGroupWallpapers": { "group_id": "dawn" },
    "sidebarOrder": ["group_id", ...] }
```

### `PATCH /api/me/preferences`
部分更新，body 同上（任意字段子集）。

## Workspace 聚合

### `GET /api/workspace`
后端按当前用户视角合并推送分类 + 自有分类。
```json
{
  "groups": [
    { "id": "...", "name": "主页", "icon": "home",
      "pushed": true, "ownerId": null, "sortOrder": 0, "readOnly": true }
  ],
  "icons": [
    { "id": "...", "groupId": "...", "name": "GitHub", "url": "...",
      "size": "sq", "letter": "G", "color": 8,
      "imageUrl": null, "isFolder": false, "iframePreview": false,
      "sub": null, "title": null, "cta": null, "sortOrder": 0,
      "readOnly": true, "folderItems": [] }
  ],
  "widgets": [
    { "id": "...", "groupId": "...", "widget": "clock",
      "wSpan": 1, "wRow": null, "config": {...}, "readOnly": true }
  ]
}
```
`readOnly` 标志前端是否允许编辑该对象（推送分类里的对象对 user 恒为 true）。

## 分类 / 图标 / 组件 CRUD

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST   | `/api/groups` | edit_own_nav | 创建分类（默认非推送，owner=me） |
| PATCH  | `/api/groups/:id` | 所有者或 admin+ | 改 name/icon |
| DELETE | `/api/groups/:id` | 所有者或 admin+ | 删除及其所有 icons/widgets |
| POST   | `/api/groups/reorder` | 所有人 | body `{ order: [groupId...] }`；普通用户落盘在自己的 sidebarOrder |
| POST   | `/api/icons` | edit_own_nav | `{ groupId, name, url, ... }` |
| PATCH  | `/api/icons/:id` | 同上 + 所属分类可编辑 | |
| DELETE | `/api/icons/:id` | 同上 | |
| POST   | `/api/icons/:id/merge-into/:target` | 同上 | 合并为文件夹 |
| POST   | `/api/icons/reorder` | 同上 | `{ groupId, order: [iconId...] }` |
| POST   | `/api/widgets` | 同上 | `{ groupId, widget, wSpan, config }` |
| PATCH  | `/api/widgets/:id` | 同上 | |
| DELETE | `/api/widgets/:id` | 同上 | |

## 上传 / Favicon

### `POST /api/upload` (multipart)
`field: file (image/*, ≤ 2MB)` → `{ "url": "/uploads/xxx.png" }`

### `GET /api/favicon?domain=github.com`
代理 Google S2 favicon（128px），Redis 缓存 24h。返回 image/png.

## 管理后台（`/api/admin/*`）

| 方法 | 路径 | 权限 |
|---|---|---|
| GET    | `/api/admin/users` | manage_users |
| PATCH  | `/api/admin/users/:id` | manage_users | 改 role |
| DELETE | `/api/admin/users/:id` | manage_users |
| POST   | `/api/admin/groups/:id/push` | manage_groups |
| DELETE | `/api/admin/groups/:id/push` | manage_groups |
| GET    | `/api/admin/visibility` | manage_users |
| PUT    | `/api/admin/visibility` | manage_users | 全量覆盖 `{ role: [groupId...] }` |
| GET    | `/api/admin/audit?limit=&kind=&actor=` | audit_log |
| GET    | `/api/admin/settings` | admin+ |
| PATCH  | `/api/admin/settings` | admin+ |
| GET    | `/api/admin/sso` | manage_sso |
| PATCH  | `/api/admin/sso` | manage_sso |
| GET    | `/api/admin/engines/builtin` | admin+ | 内置搜索引擎列表（只读）|

## 小组件真实数据（best-effort）

| 路径 | 说明 |
|---|---|
| `GET /api/widgets/weather?city=北京` | 如配置 `[weather] key="..."` 接入和风天气，否则返回静态样本 |
| `GET /api/widgets/hot` | 微博热搜代理 + Redis 缓存 10min |

## 静态

- `GET /uploads/*` → `uploads/` 目录
- `GET /*` （非上面路径）→ `frontend/dist/index.html`（SPA fallback）
