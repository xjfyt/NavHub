# NavHub

NavHub 是一款开源、自托管的个人导航主页，适合部署在家庭实验室、内网或 VPS 上。

## 功能特性

- **多种图标样式**：方形、长条、大格、圆形，支持自定义颜色、字体、对齐
- **文件夹**：2×2 / 3×3 网格预览，支持拖拽排序与合并
- **小组件**：时钟、天气、搜索等，三档固定尺寸自适应
- **壁纸库**：内置 Bing / Wikimedia / NASA / Unsplash / Wallhaven / Pexels / Pixabay 多来源，支持随机轮换
- **分类导航**：多分类侧栏，拖拽跨分类移动（悬停切换并实时预览）
- **SSO**：支持 OIDC 兼容的单点登录（Casdoor / Authentik 等）
- **多用户**：多租户数据隔离，超级管理员后台
- **S3 存储**：图片上传支持本地或 S3 兼容的对象存储

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + @dnd-kit |
| 后端 | Rust 1.95 + Axum 0.7 + SQLx |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |

---

## 快速开始（Docker Compose）

### 方式一：从源码构建（推荐用于本地测试）

```bash
# 1. 克隆仓库
git clone https://github.com/xjfyt/NavHub.git
cd NavHub

# 2. 编辑配置（至少修改数据库密码与 public_url）
cp config.example.toml config.toml
vim config.toml

# 3. 启动（自动构建镜像 + 拉起 PG / Redis）
docker compose up -d

# 浏览器访问 http://localhost:8080
```

### 方式二：使用预构建镜像

```yaml
# docker-compose.yaml（一体镜像示例）
services:
  navhub:
    image: ghcr.io/xjfyt/navhub:latest
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
      - uploads:/app/uploads
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
  uploads:
```

### 方式三：前后端分离部署

```yaml
# 前端（nginx）+ 后端分开运行示例
services:
  navhub-backend:
    image: ghcr.io/xjfyt/navhub-backend:latest
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
      - uploads:/app/uploads

  navhub-frontend:
    image: ghcr.io/xjfyt/navhub-frontend:latest
    restart: unless-stopped
    ports:
      - "80:80"
    environment:
      # 前端 nginx 将 /api、/auth 代理到此地址
      - BACKEND_URL=http://navhub-backend:8080

  postgres:
    image: postgres:15-alpine
    # ...

  redis:
    image: redis:7-alpine
    # ...
```

默认超级管理员账号：`superadmin` / `superadmin`（首次登录强制修改密码）。

---

## 可用镜像

| 镜像 | 说明 | 架构 |
|---|---|---|
| `ghcr.io/xjfyt/navhub:latest` | 一体镜像（前端 + 后端） | amd64, arm64 |
| `ghcr.io/xjfyt/navhub-backend:latest` | 仅后端 API | amd64, arm64 |
| `ghcr.io/xjfyt/navhub-frontend:latest` | 仅前端（nginx + 代理） | amd64, arm64 |

---

## 本地开发

### 环境依赖

| 工具 | 版本要求 |
|---|---|
| Rust | ≥ 1.95.0（通过 `rustup` 安装） |
| Node.js | ≥ 20 |
| pnpm 或 npm | 任意 |
| PostgreSQL | ≥ 15 |
| Redis | ≥ 7 |

**安装 Rust：**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

项目 `backend/rust-toolchain.toml` 会让 `cargo` 自动使用 1.95.0，无需手动 `rustup override`。

**安装前端依赖：**

```bash
cd frontend && npm install   # 或 pnpm install
```

### 配置

```bash
cp config.example.toml config.toml
# 修改 config.toml 中的数据库连接、Redis 地址、public_url 等
```

### 一键启动（开发模式）

```bash
./dev.sh
```

并行启动后端（端口 `8088`，`cargo watch` 热重载）与前端开发服务器（端口 `5173`，Vite HMR）。

- 开发访问：http://127.0.0.1:5173
- 后端 API：http://127.0.0.1:8088

### 单独运行

```bash
# 仅后端
cd backend && cargo run

# 仅前端
cd frontend && npm run dev
```

---

## 类型检查 / Lint

```bash
# 前端 TypeScript 检查
cd frontend && npm run lint

# 后端编译检查
cd backend && cargo check

# Clippy（Rust Linter）
cd backend && cargo clippy
```

---

## 手动构建

### 前端

```bash
cd frontend
npm run build
# 产物输出到 frontend/dist/
```

### 后端

```bash
cd backend
cargo build --release
# 二进制输出到 backend/target/release/navhub
```

### 构建 Docker 镜像

```bash
# 一体镜像
docker build -t navhub:local .

# 仅后端
docker build --target backend -t navhub-backend:local .

# 仅前端（nginx）
docker build --target frontend -t navhub-frontend:local .

# 多架构（需要 Docker Buildx + QEMU）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t navhub:local .
```

---

## 环境变量覆盖配置

所有 `config.toml` 中的配置项均可通过环境变量覆盖，格式为 `NAVHUB__<SECTION>__<KEY>`：

```bash
NAVHUB__DATABASE__HOST=postgres
NAVHUB__DATABASE__PASSWORD=secret
NAVHUB__SERVER__PORT=9000
NAVHUB__APP__LOG_LEVEL=debug
```

---

## License

MIT
