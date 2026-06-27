# 二、运行与部署

> **对应代码**：`dev.sh`、`Dockerfile`、`docker-compose.yaml`
> **维护提示**：部署流程变更时同步更新本文档。

## 1、本地开发

### 1.1 环境依赖

| 工具 | 版本要求 |
|------|----------|
| Rust | ≥ 1.95.0（通过 `rustup` 安装） |
| Node.js | ≥ 20 |
| pnpm / npm | 任意 |
| PostgreSQL | ≥ 15 |
| Redis | ≥ 7 |

### 1.2 配置

```bash
cp config.example.toml config.toml
# 修改 config.toml 中的数据库连接、Redis 地址、外部 S3 等
```

### 1.3 一键启动（开发模式）

```bash
./dev.sh
```

并行启动后端（端口 `8088`，热重载）与前端开发服务器（端口 `5173`，Vite HMR）。

- 开发访问：http://127.0.0.1:5173
- 后端 API：http://127.0.0.1:8088

### 1.4 单独运行

```bash
# 仅后端
cd backend && cargo run

# 仅前端
cd frontend && npm run dev
```

## 2、生产部署

### 2.1 使用 docker-compose 启动所有服务

如果您希望一键拉起包括 NavHub、PostgreSQL 和 Redis 在内的所有基础组件，可以使用 `docker-compose.yaml`：

```yaml
services:
  navhub:
    image: ghcr.io/xjfyt/navhub:latest
    restart: unless-stopped
    ports:
      # 应用监听 8088,两侧端口须一致
      - "8088:8088"
    environment:
      - NAVHUB__DATABASE__HOST=postgres
      - NAVHUB__DATABASE__USER=navhub
      - NAVHUB__DATABASE__PASSWORD=your_password
      - NAVHUB__DATABASE__DATABASE=navhub
      - NAVHUB__REDIS__HOST=redis
    volumes:
      - ./config.toml:/app/config.toml:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=navhub
      - POSTGRES_PASSWORD=your_password
      - POSTGRES_DB=navhub
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U navhub"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### 2.2 使用纯 Docker 命令接入外部服务

如果您已经有了外部的 PostgreSQL、Redis 和 Nginx，且存储采用外部 S3 / MinIO，您可以仅启动 NavHub 的应用容器，配置均由挂载的 `config.toml` 提供。

**(1) 准备 `config.toml`**

创建 `config.toml` 并填入您外部基础设施的连接信息：

```toml
[server]
host = "0.0.0.0"
port = 8088

[database]
host = "192.168.1.100"  # 外部 PostgreSQL IP
port = 5432
user = "navhub"
password = "your_password"
database = "navhub"

[redis]
host = "192.168.1.101"  # 外部 Redis IP
port = 6379
password = "your_password"
db = 0

[storage.s3]
endpoint = "https://minio.example.com"
region = "us-east-1"
bucket = "navigation"
access_key = "replace-me"
secret_key = "replace-me"
```

**(2) 启动应用容器**

由于镜像内已包含前端，您只需启动这 1 个容器：

```bash
docker run -d \
  --name navhub \
  --restart unless-stopped \
  -p 8088:8088 \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  ghcr.io/xjfyt/navhub:v0.1.1
```

**(3) 配置您的外部 Nginx**

在您的外部 Nginx 中，将所有请求代理给这单一容器：

```nginx
server {
    listen 80;
    server_name navhub.example.com;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 3、环境变量覆盖配置

所有 `config.toml` 中的配置项均可通过环境变量覆盖，格式为 `NAVHUB__<SECTION>__<KEY>`：

```bash
NAVHUB__DATABASE__HOST=postgres
NAVHUB__DATABASE__PASSWORD=secret
NAVHUB__SERVER__PORT=9000
NAVHUB__APP__LOG_LEVEL=debug
```

## 4、手动构建

### 4.1 前端

```bash
cd frontend
npm run build
# 产物输出到 frontend/dist/
```

### 4.2 后端

```bash
cd backend
cargo build --release
# 二进制输出到 backend/target/release/navhub
```

### 4.3 构建 Docker 镜像

```bash
# 构建一体化镜像
docker build -t navhub:local .

# 多架构（需要 Docker Buildx + QEMU）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t navhub:local .
```

---
- 上一篇：[01-build.md](./01-build.md)
- 下一篇：[03-data-directory.md](./03-data-directory.md)
- 返回索引：[docs/README.md](../README.md)