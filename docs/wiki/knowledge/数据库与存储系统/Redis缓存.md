# Redis 缓存策略

## 概述
NavHub 使用 Redis 7 作为缓存、会话存储和限流后端。

## 连接配置

```toml
[redis]
host = "127.0.0.1"
port = 6379
password = ""
db = 0
```

## 使用场景

### 1. 会话存储
- 键格式：session:{uuid}
- 值：JSON 序列化的 SessionData
- TTL：7 天（可配置 session_ttl_days）
- 操作：SET/GET/DEL

### 2. OAuth State 缓存
- 键格式：oauth_state:{state}
- 值：CSRF token
- TTL：5 分钟
- 用途：OIDC 登录时防止 CSRF 攻击

### 3. 登录限流
- 键格式：login:{ip}
- 值：尝试次数
- TTL：5 分钟窗口
- 策略：5 分钟内最多 10 次，超出锁定 15 分钟

### 4. Favicon 缓存
- 键格式：favicon:{domain}
- 值：favicon 图片二进制
- TTL：24 小时
- 用途：避免重复代理 Google S2 favicon

### 5. 热搜缓存
- 键格式：hot:weibo
- 值：JSON 序列化的热搜数据
- TTL：10 分钟
- 用途：微博热搜小组件

### 6. 用户在线状态
- 键格式：user:seen:{uid}
- 值：1
- TTL：60 秒
- 用途：限制 last_seen_at 更新频率

### 7. SSO 配置缓存
- 键格式：sso:config
- 值：JSON 序列化的 SSO 配置
- TTL：5 分钟
- 用途：避免频繁查询数据库

## 键命名规范

```
{module}:{entity}:{identifier}
```

示例：
- session:abc123
- oauth_state:xyz789
- login:192.168.1.1
- favicon:github.com

## 性能优化

### 连接池
- 使用 deadpool-redis 连接池
- 复用连接减少握手开销

### 批量操作
- 使用 pipeline 批量执行命令
- 减少网络往返

### 数据压缩
- 大值使用 JSON 压缩
- 二进制数据使用 gzip

## 容错处理

### Redis 不可用
- 会话功能降级：返回 500 Service Error
- 缓存失效：直接查询数据源
- 限流失效：允许请求通过

### 数据丢失
- Redis 重启丢数据仅引起会话过期重登录
- 不影响核心业务数据（存储在 PostgreSQL）

## 监控指标

- 连接数
- 命中率
- 内存使用
- 命令延迟
- 键数量
