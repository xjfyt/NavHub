# NavHub

NavHub 是一款开源、自托管的个人导航主页，适合部署在家庭实验室、内网或 VPS 上。

## 一、功能特性

- **多种图标样式**：方形、长条、大格、圆形，支持自定义颜色、字体、对齐
- **内置图标库**：全面接入 Iconify 集合，支持多数据源管理、前端模糊搜索、防抖与图库重命名
- **文件夹**：2×2 / 3×3 网格预览，支持拖拽排序与合并
- **小组件**：时钟、天气、搜索等，三档固定尺寸自适应
- **壁纸库**：内置 Bing / Wikimedia / NASA / Unsplash / Wallhaven / Pexels / Pixabay 多来源，支持随机轮换及响应式网格适配
- **分类导航**：多分类侧栏，拖拽跨分类移动（悬停切换并实时预览）
- **SSO**：支持 OIDC 兼容的单点登录（Casdoor / Authentik 等）
- **多用户**：多租户数据隔离，超级管理员后台
- **S3 存储**：图片上传及系统托管基于 S3 兼容的对象存储

## 二、技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + @dnd-kit |
| 后端 | Rust 1.95 + Axum 0.7 + SQLx |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |

---

## 三、快速部署

NavHub 现已全面统一为一体化容器，由 Rust 后端同时处理 API 及前端静态资源的托管。默认超级管理员账号：`superadmin` / `superadmin`（首次登录强制修改密码）。

### 1、使用 docker-compose 启动所有服务

如果您希望一键拉起包括 NavHub、PostgreSQL 和 Redis 在内的所有基础组件，可以使用 `docker-compose.yaml`：

```yaml
services:
  navhub:
    image: ghcr.io/xjfyt/navhub:v0.1.1
    restart: unless-stopped
    ports:
      - "8080:8080"
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

### 2、使用纯 Docker 命令接入外部服务

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

---

## 四、本地开发

### 1、环境依赖

| 工具 | 版本要求 |
|---|---|
| Rust | ≥ 1.95.0（通过 `rustup` 安装） |
| Node.js | ≥ 20 |
| pnpm / npm | 任意 |
| PostgreSQL | ≥ 15 |
| Redis | ≥ 7 |

**安装 Rust：**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

项目 `backend/rust-toolchain.toml` 会自动使用 1.95.0，无需手动配置。

**安装前端依赖：**

```bash
cd frontend && npm install
```

### 2、配置

```bash
cp config.example.toml config.toml
# 修改 config.toml 中的数据库连接、Redis 地址、外部 S3 等
```

### 3、一键启动（开发模式）

```bash
./dev.sh
```

并行启动后端（端口 `8088`，热重载）与前端开发服务器（端口 `5173`，Vite HMR）。

- 开发访问：http://127.0.0.1:5173
- 后端 API：http://127.0.0.1:8088

### 4、单独运行

```bash
# 仅后端
cd backend && cargo run

# 仅前端
cd frontend && npm run dev
```

---

## 五、类型检查 / Lint

```bash
# 前端 TypeScript 检查
cd frontend && npm run lint

# 后端编译检查
cd backend && cargo check

# Clippy（Rust Linter）
cd backend && cargo clippy
```

---

## 六、手动构建

### 1、前端

```bash
cd frontend
npm run build
# 产物输出到 frontend/dist/
```

### 2、后端

```bash
cd backend
cargo build --release
# 二进制输出到 backend/target/release/navhub
```

### 3、构建 Docker 镜像

```bash
# 构建一体化镜像
docker build -t navhub:local .

# 多架构（需要 Docker Buildx + QEMU）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t navhub:local .
```

---

## 七、环境变量覆盖配置

所有 `config.toml` 中的配置项均可通过环境变量覆盖，格式为 `NAVHUB__<SECTION>__<KEY>`：

```bash
NAVHUB__DATABASE__HOST=postgres
NAVHUB__DATABASE__PASSWORD=secret
NAVHUB__SERVER__PORT=9000
NAVHUB__APP__LOG_LEVEL=debug
```

---

## 八、License

MIT
