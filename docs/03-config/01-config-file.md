# 一、配置文件

> **对应代码**：`backend/src/config.rs`、`config.example.toml`
> **维护提示**：配置项变更时同步更新本文档。

## 1、配置文件位置

| 文件 | 用途 | 是否纳入版本控制 |
|------|------|------------------|
| `config.example.toml` | 配置示例 | 是 |
| `config.toml` | 实际配置 | 否（已加入 .gitignore） |

## 2、配置优先级

1. 环境变量（`NAVHUB__<SECTION>__<KEY>`）
2. 后台运行时覆盖（存储在 `app_settings` 表）
3. `config.toml` 文件
4. 默认值

## 3、配置项说明

### 3.1 服务器配置

```toml
[server]
host = "0.0.0.0"          # 监听地址
port = 8088                # 监听端口
public_url = "http://localhost:8088"  # 生产环境反代域名
# trusted_proxies = ["10.0.0.0/8", "172.18.0.1"]  # 受信反向代理 IP/CIDR
```

### 3.2 数据库配置

```toml
[database]
host = "127.0.0.1"         # 数据库主机
port = 5432                # 数据库端口
user = "navhub"            # 数据库用户
password = "CHANGE_ME"     # 数据库密码
database = "navhub"        # 数据库名
max_connections = 10       # 最大连接数
```

### 3.3 Redis 配置

```toml
[redis]
host = "127.0.0.1"         # Redis 主机
port = 6379                # Redis 端口
password = ""              # Redis 密码（无密码留空）
db = 0                     # Redis 数据库编号
```

### 3.4 超级管理员配置

```toml
[superadmin]
username = "superadmin"    # 超级管理员用户名
password = "superadmin"    # 超级管理员密码（首次登录强制修改）
email = "admin@example.com"  # 超级管理员邮箱
display_name = "Super Admin"  # 显示名称
# password_login_enabled = true  # 是否允许超管用账号密码登录
# first_sso_bind = false  # 首位 SSO 登录用户自动升级为 superadmin
# first_sso_bind_allowlist = ["admin@example.com"]  # 首位 SSO 登录白名单
# force_change_password = true  # 是否要求超管首次登录强制修改密码
```

### 3.5 SSO 配置

```toml
[sso]
enabled = false            # 是否启用 SSO
issuer = "https://sso.example.com"  # OIDC Issuer
client_id = "CHANGE_ME"   # 客户端 ID
client_secret = "CHANGE_ME"  # 客户端密钥
redirect_uri = "http://localhost:8088/auth/callback"  # 回调地址
scopes = ["openid", "profile", "email"]  # 请求的权限范围
# jwks_uri = ""  # JWKS 端点（留空则从 issuer 推导）
```

### 3.6 应用配置

```toml
[app]
audit_retention_days = 90  # 审计日志保留天数
session_ttl_days = 7       # 会话有效期（天）
upload_max_mb = 2          # 上传文件大小限制（MB）
log_level = "info"         # 日志级别
# log_format = "pretty"   # 日志格式：pretty 或 json
# admin_fetch_max_concurrency = 2  # 管理员抓取任务最大并发数
# tls_accept_invalid_certs = false  # 是否关闭 HTTPS 证书校验
# favicon_allow_private_targets = false  # 是否允许 favicon 代理访问私有 IP
# readyz_check_storage = false  # 是否在就绪探测中检查 S3
# readyz_storage_timeout_ms = 2000  # S3 就绪探测超时（毫秒）
```

### 3.7 S3 存储配置

```toml
[storage.s3]
endpoint = "https://s3.example.com"  # S3 端点
region = "us-east-1"       # 区域
bucket = "navhub"          # 存储桶
access_key = "CHANGE_ME"   # 访问密钥
secret_key = "CHANGE_ME"   # 秘密密钥
path_style = true          # 是否使用路径风格
key_prefix = "assets"      # 键前缀
presign_ttl_secs = 86400   # 预签名 URL 有效期（秒）
```

### 3.8 天气配置

```toml
[weather]
key = ""                   # 和风天气 API 密钥（留空则返回静态样例）
```

### 3.9 前端配置

```toml
[frontend]
dist_dir = "./frontend/dist"  # 前端静态文件目录
```

## 4、环境变量覆盖

所有配置项均可通过环境变量覆盖，格式为 `NAVHUB__<SECTION>__<KEY>`：

```bash
# 示例
NAVHUB__DATABASE__HOST=postgres
NAVHUB__DATABASE__PASSWORD=secret
NAVHUB__SERVER__PORT=9000
NAVHUB__APP__LOG_LEVEL=debug
```

## 5、运行时覆盖

超级管理员可在后台覆盖部分配置项（SSO、system 等），覆盖值存入 `app_settings` 表，优先级高于配置文件。

---
- 上一篇：[02-getting-started/03-data-directory.md](../02-getting-started/03-data-directory.md)
- 下一篇：[02-design-tokens.md](./02-design-tokens.md)
- 返回索引：[docs/README.md](../README.md)