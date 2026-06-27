# OIDC 集成

## 概述
NavHub 支持基于 OpenID Connect (OIDC) 的单点登录，主要使用 Casdoor 作为身份提供商。

## 认证流程

### 1. 用户访问登录页面
用户点击登录按钮，前端调用 `GET /auth/login`

### 2. 重定向到 OIDC 提供商
后端生成 state 参数，存储到 Redis（TTL 5分钟），重定向到 Casdoor 授权端点

### 3. 用户认证
用户在 Casdoor 页面完成认证

### 4. 回调处理
Casdoor 重定向到 `/auth/callback?code=xxx&state=xxx`

### 5. 令牌交换
后端验证 state，使用 code 换取 access_token

### 6. 获取用户信息
使用 access_token 获取用户信息（userinfo）

### 7. 创建会话
- 如果用户不存在，创建新用户
- 如果用户已存在，更新用户信息
- 创建会话，存储到 Redis
- 设置 Cookie

## 配置示例

```toml
[sso]
enabled = true
issuer = "https://sso.example.com"
client_id = "your_client_id"
client_secret = "your_client_secret"
redirect_uri = "http://localhost:8088/auth/callback"
scopes = ["openid", "profile", "email"]
```

## 关键代码

### state 参数生成
```rust
let state = Uuid::new_v4().to_string();
redis::cmd("SET")
    .arg(format!("oauth_state:{state}"))
    .arg(&csrf_token)
    .arg("EX")
    .arg(300)  // 5分钟过期
    .execute_async(&mut conn)
    .await?;
```

### 令牌交换
```rust
let token_response = reqwest::Client::new()
    .post(&token_endpoint)
    .form(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", &redirect_uri),
        ("client_id", &client_id),
        ("client_secret", &client_secret),
    ])
    .send()
    .await?;
```

## 安全注意事项

1. **State 参数验证**：防止 CSRF 攻击
2. **HTTPS 强制**：生产环境必须使用 HTTPS
3. **令牌存储**：access_token 不存储在前端
4. **会话安全**：Cookie 设置 HttpOnly、Secure、SameSite=Lax

## 错误处理

### 常见错误
- `401 Unauthorized`：认证失败
- `403 Forbidden`：权限不足
- `429 Too Many Requests`：登录限流

### 错误响应格式
```json
{
  "error": "unauthorized",
  "message": "Invalid credentials"
}
```

## 扩展性
支持其他 OIDC 提供商（如 Authentik、Keycloak），只需修改配置即可。
