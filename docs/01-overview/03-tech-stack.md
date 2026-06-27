# 三、技术栈

> **对应代码**：`backend/Cargo.toml`、`frontend/package.json`、`Dockerfile`
> **维护提示**：技术栈变更时同步更新本文档。

## 1、后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 1.95.0 | 主要编程语言 |
| Axum | 0.7 | Web 框架 |
| SQLx | 0.8 | 数据库访问 |
| Redis | 7 | 缓存、会话存储 |
| PostgreSQL | 15 | 主数据库 |
| Argon2 | - | 密码哈希 |
| Casdoor | - | OIDC 认证 |

## 2、前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18 | UI 框架 |
| TypeScript | 5 | 类型安全 |
| Vite | 5 | 构建工具 |
| @dnd-kit | - | 拖拽功能 |
| Tailwind CSS | - | 样式框架 |

## 3、基础设施

| 组件 | 用途 |
|------|------|
| Docker | 容器化部署 |
| Nginx | 反向代理 |
| S3/MinIO | 文件存储 |
| Cloudflare | CDN 加速 |

## 4、开发工具

| 工具 | 用途 |
|------|------|
| Cargo | Rust 包管理 |
| pnpm/npm | Node.js 包管理 |
| Git | 版本控制 |
| GitHub Actions | CI/CD |

## 5、架构特点

### 5.1 单进程部署

Rust 后端同时：
1. 提供 REST API（`/api/*`）
2. 托管前端构建产物（`frontend/dist/` → `/` 所有非 `/api` 路由）
3. 处理 OIDC 回调（`/auth/*`）
4. 托管用户上传（`/uploads/*`）

### 5.2 数据流

```
Browser ──(1) /auth/login──→ Rust ──(2) 302──→ Casdoor
       ←─(5) Set-Cookie─── ←──(4) token/userinfo── ↑
       ──(3) /auth/callback?code=...─────────────── ↓
Browser ──(6) /api/*──→ Rust ──→ PG / Redis
```

### 5.3 会话管理

- Session 存 Redis，`session:{uuid}` → `{user_id, role}`，TTL 7 天
- Cookie `nh_sid` `HttpOnly; Secure; SameSite=Lax`

---
- 上一篇：[02-architecture.md](./02-architecture.md)
- 下一篇：[02-getting-started/01-build.md](../02-getting-started/01-build.md)
- 返回索引：[docs/README.md](../README.md)