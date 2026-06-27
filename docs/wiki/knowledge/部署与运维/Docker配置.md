# Docker 配置

## 概述
NavHub 使用多阶段 Docker 构建，包含前端构建、后端构建和最终运行镜像。

## Dockerfile 结构

### Stage 1: 前端构建
使用 node:20-alpine 构建前端静态资源。

### Stage 2: 后端构建
使用 rust:1.95.0-bullseye 编译后端二进制。

### Stage 3: 运行镜像
使用 debian:bullseye-slim 运行应用，非 root 用户。

## Docker Compose

### 服务
- navhub: 应用服务 (端口 8088)
- postgres: PostgreSQL 15 数据库
- redis: Redis 7 缓存

### 安全特性
- 非 root 用户运行 (uid 10001)
- no-new-privileges 防止提权
- 资源限制防止吃满宿主
- 健康检查确保依赖就绪

## 启动
`ash
docker compose up -d
``n
## 数据持久化
- postgres_data: PostgreSQL 数据卷
- redis_data: Redis 数据卷

## 多副本部署
首次上线含新迁移时，先缩到 1 副本完成迁移再扩容。