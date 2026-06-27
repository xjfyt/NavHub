---
title: Docker容器化部署详解
description: NavHub项目的Docker部署完整指南，包含多阶段构建、安全加固和生产环境最佳实践
keywords: Docker, 部署, 容器化, 生产环境, 多阶段构建
author: NavHub Team
last_updated: 2026-06-27
category: 运维指南
nav_order: 1
---

# Docker容器化部署详解

> **对应代码**：`Dockerfile`、`docker-compose.yaml`、`config.example.toml`
> **维护提示**：部署配置变更时同步更新本文档。

本文档详细介绍NavHub项目的Docker容器化部署方案，包括多阶段构建、安全加固和生产环境最佳实践。

---

## 1. 项目架构概述

NavHub采用前后端分离架构，Docker部署包含三个核心服务：

| 服务 | 镜像 | 说明 |
|------|------|------|
| **navhub** | 自定义构建 | 主应用服务（Rust后端 + 前端静态资源） |
| **postgres** | postgres:15-alpine | PostgreSQL 数据库 |
| **redis** | redis:7-alpine | Redis 缓存/会话存储 |

## 2. Dockerfile 多阶段构建

NavHub的Dockerfile采用三阶段构建策略，优化镜像体积和构建速度。

### 2.1 阶段一：前端构建器

```dockerfile
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend .
RUN npm run build
```

**要点**：

- 使用 `node:20-alpine` 轻量基础镜像
- 先复制 `package.json` 再安装依赖，充分利用Docker层缓存
- `npm install` 而非 `npm ci`：规避Windows锁文件在Linux musl平台下的原生二进制安装问题

### 2.2 阶段二：后端构建器

```dockerfile
FROM --platform=$BUILDPLATFORM rust:1.95.0-bullseye AS backend-builder
ARG TARGETARCH
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend
# ARM64 交叉编译
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        apt-get update && apt-get install -y gcc-aarch64-linux-gnu \
        g++-aarch64-linux-gnu libc6-dev-arm64-cross && \
        rustup target add aarch64-unknown-linux-gnu; fi
# Cargo 构建（带缓存挂载）
RUN --mount=type=cache,id=cargo-registry-${TARGETARCH},target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-target-${TARGETARCH},target=/app/backend/target \
    cargo build --release && cp target/release/navhub /tmp/navhub
```

**要点**：

- `BUILDPLATFORM` + `TARGETARCH` 支持多架构构建（amd64/arm64）
- Cargo注册表和构建目标使用缓存挂载加速增量编译
- ARM64交叉编译需额外安装GCC交叉编译工具链

### 2.3 阶段三：运行时镜像

运行时镜像使用 `debian:bullseye-slim`，创建专用非root用户（UID 10001）运行应用。健康检查端点 `/api/readyz` 验证PostgreSQL和Redis连通性。

## 3. Docker Compose 配置详解

### 3.1 环境变量配置

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```bash
PG_USER=navhub
PG_PASSWORD=your_secure_password_here
PG_DATABASE=navhub
```

> **安全提示**：切勿将 `.env` 文件提交到版本控制。该文件已在 `.gitignore` 中排除。

### 3.2 服务依赖与健康检查

应用在PostgreSQL和Redis健康检查通过后才启动，避免启动时连接失败。

### 3.3 资源限制

| 服务 | 内存限制 | CPU | PID限制 |
|------|---------|-----|---------|
| navhub | 512MB | 1.0 | 256 |
| postgres | 512MB | 1.0 | - |
| redis | 256MB | 0.5 | - |

### 3.4 安全加固

所有服务均配置了 `no-new-privileges:true`，防止进程通过setuid提权。

## 4. 部署流程

### 4.1 首次部署

```bash
# 1. 克隆项目并配置环境变量
git clone <repo-url> navhub && cd navhub
cp .env.example .env  # 编辑 .env 设置数据库凭据

# 2. 可选：自定义应用配置
cp config.example.toml config.toml

# 3. 构建并启动
docker compose up -d --build

# 4. 验证服务状态
docker compose ps
curl http://localhost:8088/api/readyz
```

### 4.2 更新部署

```bash
git pull
docker compose up -d --build
```

### 4.3 查看日志

```bash
docker compose logs -f          # 所有服务
docker compose logs -f navhub   # 仅应用
```

## 5. 反向代理配置

### 5.1 Nginx 示例

```nginx
server {
    listen 80;
    server_name navhub.example.com;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /assets/ {
        proxy_pass http://127.0.0.1:8088;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5.2 Caddy 示例

```
navhub.example.com {
    reverse_proxy localhost:8088
}
```

## 6. 环境变量覆盖

应用支持通过环境变量覆盖配置，格式为 `NAVHUB__<SECTION>__<KEY>`：

```bash
NAVHUB__SERVER__PORT=9090
NAVHUB__DATABASE__HOST=db.example.com
NAVHUB__REDIS__HOST=redis.example.com
```

## 7. 常见问题排查

### 7.1 容器启动失败

```bash
docker compose ps       # 检查容器状态
docker compose logs navhub  # 查看详细日志
```

### 7.2 数据库连接失败

- 确认PostgreSQL容器健康检查已通过
- 验证 `.env` 中的数据库凭据正确
- 检查网络连通性

### 7.3 前端资源404

- 确认前端构建成功
- 检查 `config.toml` 中 `dist_dir` 路径是否为 `/app/frontend/dist`

---

- 上一篇：（无，这是首篇）
- 下一篇：[CDN配置](./CDN配置.md)
- 返回目录：[运维指南](./README.md)
