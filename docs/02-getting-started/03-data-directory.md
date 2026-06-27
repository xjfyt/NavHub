# 三、数据目录

> **对应代码**：`backend/src/config.rs`、`config.toml`
> **维护提示**：数据目录配置变更时同步更新本文档。

## 1、配置文件

### 1.1 主配置文件

| 文件 | 用途 | 位置 |
|------|------|------|
| `config.toml` | 主配置文件 | 项目根目录 |
| `config.example.toml` | 配置示例 | 项目根目录 |

### 1.2 配置结构

```toml
[server]
host = "0.0.0.0"
port = 8088

[database]
host = "localhost"
port = 5432
user = "navhub"
password = "password"
database = "navhub"

[redis]
host = "localhost"
port = 6379
password = ""
db = 0

[storage.s3]
endpoint = "https://minio.example.com"
region = "us-east-1"
bucket = "navigation"
access_key = "access_key"
secret_key = "secret_key"

[auth]
casdoor_endpoint = "https://casdoor.example.com"
casdoor_client_id = "client_id"
casdoor_client_secret = "client_secret"
casdoor_redirect_uri = "https://navhub.example.com/auth/callback"

[app]
log_level = "info"
```

## 2、数据库

### 2.1 PostgreSQL

- **数据库名**：`navhub`
- **默认用户**：`navhub`
- **默认端口**：`5432`

### 2.2 数据库迁移

迁移文件位于 `backend/migrations/` 目录，按编号顺序执行：

```bash
# 安装 sqlx-cli
cargo install sqlx-cli --no-default-features --features rustls,postgres

# 执行迁移
cd backend && sqlx migrate run
```

## 3、Redis

### 3.1 会话存储

- **键格式**：`session:{uuid}`
- **值**：`{user_id, role}`
- **TTL**：7 天

### 3.2 缓存

- **图标缓存**：`icon:{id}`
- **壁纸缓存**：`wallpaper:{id}`

## 4、文件存储

### 4.1 本地存储

- **上传目录**：`uploads/`
- **图标文件**：`uploads/icons/`
- **壁纸文件**：`uploads/wallpapers/`

### 4.2 S3 存储

- **Bucket**：`navigation`
- **区域**：`us-east-1`
- **端点**：S3 兼容服务（MinIO、AWS S3 等）

## 5、日志

### 5.1 日志级别

- `error`：错误信息
- `warn`：警告信息
- `info`：一般信息（默认）
- `debug`：调试信息
- `trace`：跟踪信息

### 5.2 日志配置

```toml
[app]
log_level = "info"
```

或通过环境变量：

```bash
NAVHUB__APP__LOG_LEVEL=debug
```

---
- 上一篇：[02-run-and-deploy.md](./02-run-and-deploy.md)
- 下一篇：[03-config/01-config-file.md](../03-config/01-config-file.md)
- 返回索引：[docs/README.md](../README.md)