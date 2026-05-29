# 开发指南

## 前置要求

- Rust 1.75+
- Node.js 20+ 与 pnpm
- PostgreSQL 可访问（见 config.toml）
- Redis 可访问

## 首次启动

```bash
# 1. 复制并编辑配置
cp config.example.toml config.toml
vim config.toml

# 2. 创建数据库（如不存在）
psql -h 10.12.31.129 -p 5433 -U xjfyt -c "CREATE DATABASE navigation"

# 3. 安装前端依赖
cd frontend && pnpm install && cd ..

# 4. 启动开发环境（并行启后端 + 前端 Vite）
./dev.sh
```

访问 `https://navigation.home.xjfyt.top/`，使用 `superadmin / superadmin`（config.toml 默认）登录。

## 目录速查

- 改后端：`backend/src/**.rs` — `cargo watch -x run` 自动重启
- 改前端：`frontend/src/**.tsx` — Vite HMR 自动刷新
- 改 SQL：新建 `backend/migrations/NNN_xxx.sql`，下次启动自动迁移
- 改配置：`config.toml` — 重启生效；运行时可变项（如 SSO）通过后台 UI 改

## 生产构建

```bash
cd frontend && pnpm build       # 产物在 frontend/dist/
cd ../backend && cargo build --release
./backend/target/release/navhub # 监听 :8088，单进程托管前后端
```

## 常用命令

```bash
# 重置数据库（谨慎）
psql -h <DB_HOST> -p 5432 -U <DB_USER> -d <DB_NAME> -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 查看活跃 session（-a 后填 redis 密码，无则省略；-n 为 redis.db）
redis-cli -h <REDIS_HOST> -a <REDIS_PASSWORD> -n 0 keys 'session:*'

# 迁移命令（sqlx-cli）
cargo install sqlx-cli --no-default-features --features rustls,postgres
cd backend && sqlx migrate run
```

## 环境变量（覆盖 config.toml）

所有配置项均可通过环境变量覆盖，格式 `NAVHUB__SECTION__KEY`：
- `NAVHUB__SERVER__PORT=9000`
- `NAVHUB__DATABASE__PASSWORD=xxx`

## 调试 tips

- Casdoor 登录失败：检查 `/api/admin/sso` 的 redirect_uri 与 Casdoor 应用配置一致
- Session 失效：Cookie 域名需匹配（开发环境用 `localhost`，生产用 `navigation.home.xjfyt.top`）
- 403 `sso_required`：尝试用非 superadmin 账号走了 `/auth/password`
