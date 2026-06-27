# 一、认证模块概述

> **对应代码**：`backend/src/auth/`、`backend/src/handlers/auth.rs`
> **维护提示**：认证逻辑变更时同步更新本文档。

## 1、模块结构

```
backend/src/auth/
├── mod.rs          # 模块入口
├── casdoor.rs      # Casdoor OIDC 客户端
├── oidc.rs         # OIDC 协议实现
├── password.rs     # 密码哈希与验证
├── session.rs      # 会话管理
├── middleware.rs    # 认证中间件
├── rate_limit.rs   # 登录限流
└── sso_cache.rs    # SSO 配置缓存
```

## 2、认证方式

### 2.1 账号密码认证

- **适用对象**：仅超级管理员
- **密码哈希**：Argon2 算法
- **首次登录**：强制修改密码
- **端点**：`POST /auth/password`

### 2.2 OIDC 单点登录

- **适用对象**：所有用户
- **支持的 OIDC 提供商**：Casdoor、Authentik 等
- **流程**：
  1. 用户访问 `/auth/login`
  2. 重定向到 OIDC 提供商
  3. 用户认证后回调 `/auth/callback`
  4. 创建会话并设置 Cookie

## 3、会话管理

### 3.1 会话存储

- **存储位置**：Redis
- **键格式**：`session:{uuid}`
- **值**：`{user_id, role}`
- **TTL**：7 天

### 3.2 Cookie 设置

- **名称**：`nh_sid`
- **属性**：`HttpOnly; Secure; SameSite=Lax`
- **域名**：根据配置自动设置

## 4、权限控制

### 4.1 角色系统

| 角色 | 说明 |
|------|------|
| `superadmin` | 超级管理员，拥有所有权限 |
| `admin` | 管理员，拥有后台管理权限 |
| `user` | 普通用户，只能编辑自有内容 |
| `guest` | 访客，只读权限 |

### 4.2 权限检查

```rust
// 检查是否为管理员
pub fn require_at_least_admin(role: Role) -> AppResult<()> {
    if role.at_least_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden("admin_required"))
    }
}

// 检查是否为超级管理员
pub fn require_superadmin(role: Role) -> AppResult<()> {
    if matches!(role, Role::Superadmin) {
        Ok(())
    } else {
        Err(AppError::Forbidden("superadmin_required"))
    }
}
```

## 5、登录限流

### 5.1 限流策略

- **窗口**：5 分钟
- **最大尝试次数**：10 次
- **锁定时间**：15 分钟

### 5.2 实现方式

- 使用 Redis 存储尝试次数
- 基于 IP 地址或用户标识限流
- 支持受信反向代理的 X-Forwarded-For

## 6、SSO 配置

### 6.1 配置项

```toml
[sso]
enabled = false
issuer = "https://sso.example.com"
client_id = "CHANGE_ME"
client_secret = "CHANGE_ME"
redirect_uri = "http://localhost:8088/auth/callback"
scopes = ["openid", "profile", "email"]
```

### 6.2 运行时覆盖

超级管理员可在后台覆盖 SSO 配置，覆盖值存入 `app_settings` 表。

## 7、错误处理

### 7.1 常见错误

- `401 Unauthorized`：未认证或认证失败
- `403 Forbidden`：权限不足
- `429 Too Many Requests`：登录限流

### 7.2 错误响应格式

```json
{
  "error": "unauthorized",
  "message": "Invalid credentials"
}
```

---
- 上一篇：[03-config/03-i18n.md](../../03-config/03-i18n.md)
- 下一篇：[02-permissions.md](./02-permissions.md)
- 返回索引：[docs/README.md](../../README.md)