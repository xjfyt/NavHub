# 三、API 接口

> **对应代码**：`backend/src/routes.rs`、`backend/src/handlers/`
> **维护提示**：新增/修改 API 路由、Handler 时同步更新本文档。

## 1、路由架构

NavHub 的 API 路由由 `routes::build()` 函数统一构建，分为三个层级：

```
┌─────────────────────────────────────────────────────────┐
│                     Axum Router                        │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  public         │  │  uploads     │  │  /api       │ │
│  │  (no auth)      │  │  (file serve)│  │  (authed)   │ │
│  │                 │  │              │  │ ┌─────────┐│ │
│  │ /auth/login     │  │ /uploads/*   │  │ │ guest   ││ │
│  │ /auth/callback  │  │              │  │ │ (opt)   ││ │
│  │ /auth/password  │  │              │  │ ├─────────┤│ │
│  │ /auth/logout    │  │              │  │ │ require ││ │
│  │ /auth/status    │  │              │  │ │ login   ││ │
│  │ /config/public  │  │              │  │ ├─────────┤│ │
│  │                 │  │              │  │ │ admin   ││ │
│  └────────────────┘  └──────────────┘  │ └─────────┘│ │
│                                        └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 2、公开端点（无需认证）

### （1）认证端点

| 方法 | 路径 | 说明 | 限流 |
|------|------|------|------|
| GET | /auth/login | 发起 OIDC 登录 | ✅ IP+账户 |
| GET | /auth/callback | OIDC 回调处理 | 无 |
| POST | /auth/password | 密码登录 | ✅ IP+账户 |
| POST | /auth/logout | 登出（清除会话） | 无 |
| GET | /auth/status | 检查认证状态 | 无 |
| GET | /api/config/public | 公开配置信息 | 无 |

### （2）健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /healthz | 存活探测，始终返回 200 |
| GET | /readyz | 就绪探测，检查 PG/Redis/Storage |

## 3、访客可见端点（optional_login）

这些端点允许未登录用户访问，但登录用户可获得个性化数据：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/workspace | 获取工作区（用户/访客视图） |
| GET | /api/wallpapers | 壁纸列表 |
| GET | /api/wallpaper-sources | 壁纸源列表 |
| GET | /api/favicon | Favicon 代理 |
| GET | /api/favicon/search | Favicon 搜索 |

## 4、认证用户端点（require_login）

### （1）用户相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PATCH | /api/me | 获取/更新个人信息 |
| GET | /api/me/export | 导出个人数据（GDPR） |
| GET/PATCH | /api/me/preferences | 获取/更新偏好设置 |
| POST | /auth/password/change | 修改密码 |

### （2）工作区 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/groups | 创建分类 |
| PATCH/DELETE | /api/groups/:id | 更新/删除分类 |
| POST | /api/groups/reorder | 分类排序 |
| POST | /api/icons | 创建图标 |
| PATCH/DELETE | /api/icons/:id | 更新/删除图标 |
| POST | /api/widgets | 创建小组件 |
| PATCH/DELETE | /api/widgets/:id | 更新/删除小组件 |
| POST | /api/upload | 上传文件 |

### （3）小组件服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/widgets/weather | 天气数据 |
| GET | /api/widgets/hot | 热搜数据 |
| GET | /api/widgets/music/search | 音乐搜索 |
| GET | /api/widgets/music/song/:id | 歌曲详情 |

## 5、管理端点（需 admin 权限）

管理端点以 `/api/admin/` 为前缀，包括：

- `/api/admin/dashboard`：仪表盘统计
- `/api/admin/users`：用户管理（列表、更新、删除）
- `/api/admin/groups/:id/push`：分类推送到全局
- `/api/admin/audit`：审计日志查看
- `/api/admin/messages`：系统消息管理
- `/api/admin/settings`：系统设置
- `/api/admin/sso`：SSO 配置
- `/api/admin/wallpaper-sources`：壁纸源管理
- `/api/admin/icon-libraries`：图标库管理

## 6、中间件层序

全局中间件从外到内依次为：

```
CatchPanic → sanitize_request_id → SetRequestId → PropagateRequestId
→ inject_request_id(span) → Trace → CORS → nosniff → Compression
```

## 7、错误响应格式

所有 API 错误返回统一 JSON 格式：

```json
{ "error": "error_code", "message": "human readable message" }
```

HTTP 状态码映射：400 Bad Request、401 Unauthorized、403 Forbidden、404 Not Found、409 Conflict、500 Internal Server Error。

---
- 上一篇：[数据库设计.md](./数据库设计.md)
- 下一篇：[缓存策略.md](./缓存策略.md)
- 返回索引：[docs/wiki/content/后端架构/](./)