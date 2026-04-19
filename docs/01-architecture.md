# NavHub 架构文档

## 概述

NavHub 是一个个人/团队导航页服务，基于"Lumen Nav"设计稿实现。

- **后端**：Rust (axum + sqlx + redis)
- **前端**：Vite + React 18 + TypeScript
- **认证**：Casdoor OIDC（所有人）+ 账号密码（仅超级管理员）
- **存储**：PostgreSQL（主数据）+ Redis（session、state、缓存）

## 部署形态

单进程部署，Rust 后端同时：
1. 提供 REST API（`/api/*`）
2. 托管前端构建产物（`frontend/dist/` → `/` 所有非 `/api` 路由）
3. 处理 OIDC 回调（`/auth/*`）
4. 托管用户上传（`/uploads/*`）

监听 `:8088`，反向代理到 `https://navigation.home.xjfyt.top`。

## 目录结构

```
NavHub/
├── config.toml              # 主配置
├── docs/                    # 设计/开发文档
├── backend/
│   ├── Cargo.toml
│   ├── migrations/          # sqlx migrations
│   └── src/
│       ├── main.rs
│       ├── config.rs        # 配置加载
│       ├── db.rs            # PG 连接池
│       ├── cache.rs         # Redis 连接池
│       ├── error.rs         # 统一错误类型
│       ├── auth/
│       │   ├── mod.rs
│       │   ├── casdoor.rs   # OIDC 客户端（动态配置）
│       │   ├── password.rs  # argon2 密码哈希
│       │   ├── session.rs   # 会话管理
│       │   └── middleware.rs
│       ├── handlers/
│       │   ├── mod.rs
│       │   ├── auth.rs
│       │   ├── me.rs
│       │   ├── workspace.rs
│       │   ├── groups.rs
│       │   ├── icons.rs
│       │   ├── widgets.rs
│       │   ├── prefs.rs
│       │   ├── upload.rs
│       │   ├── favicon.rs
│       │   └── admin/
│       └── models/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/             # fetch 包装
│   │   ├── components/      # 迁移自设计稿 *.jsx
│   │   ├── styles/
│   │   └── types/
│   └── public/
├── uploads/                 # 用户上传图标（gitignored）
├── dev.sh                   # 本地开发一键启动
└── README.md
```

## 数据流

```
Browser ──(1) /auth/login──→ Rust ──(2) 302──→ Casdoor
       ←─(5) Set-Cookie─── ←──(4) token/userinfo── ↑
       ──(3) /auth/callback?code=...─────────────── ↓
Browser ──(6) /api/*──→ Rust ──→ PG / Redis
```

Session 存 Redis，`session:{uuid}` → `{user_id, role}`，TTL 7 天。Cookie `nh_sid` `HttpOnly; Secure; SameSite=Lax`.

## 权限核心

见 [02-permissions.md](02-permissions.md).

## 设计稿来源

- 原始设计：`/Users/xjfyt/Downloads/navigation/project/`
- README 指引："recreate pixel-perfectly in whatever technology makes sense"
- 我们保留：像素级视觉还原、角色权限模型、交互（拖拽/合并/滚轮翻页/右键菜单）
- 我们改变：React CDN → Vite 工程化；mock 数据 → 真实 API
- 我们删除：`RoleSwitcher` demo 组件、mock SSO 流程
