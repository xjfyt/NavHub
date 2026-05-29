# 贡献指南

感谢参与 NavHub。本项目为前后端一体的导航站:后端 Rust + Axum + SQLx(PostgreSQL)+ Redis + S3,前端 React 18 + TypeScript + Vite。

## 环境要求

- Rust(见 `rust-toolchain.toml`)、Cargo
- Node 20+、npm
- 本地或容器化的 PostgreSQL 与 Redis(运行时需要;**单元测试不需要**)
- 复制 `config.example.toml` 为 `config.toml`、`.env.example` 为 `.env` 并填好

## 本地开发

```bash
# 后端
cd backend
cargo run                 # 启动服务(读取 ../config.toml 或 NAVHUB_CONFIG)

# 前端
cd frontend
npm install
npm run dev               # Vite 开发服务器(默认 :5173,已配置代理到后端)
```

## 提交前自检(与 CI 等价)

CI(`.github/workflows/ci.yml`)会强制以下检查,请在提交前本地跑通:

```bash
# 后端
cd backend
cargo fmt --all --check                       # 格式
cargo clippy --all-targets -- -D warnings     # lint(零告警)
cargo test                                    # 单元测试(无需数据库)

# 前端
cd frontend
npm run lint:eslint                           # ESLint(零 error)
npm run format:check                          # Prettier
npm run lint                                  # tsc 类型检查
npm test                                      # vitest
npm run build                                 # 构建
```

格式问题可用 `cargo fmt` / `npm run format` 自动修复。

## 测试约定

- 遵循 TDD:**先写失败测试,再实现**。安全/正确性修复必须带回归测试。
- 纯逻辑(解析、计算、校验、状态机)优先抽成纯函数并单测;React 组件目前无 `@testing-library`,以纯逻辑单测 + 构建/类型检查覆盖。
- 验证 cargo 结果时**不要**用 `| tail` 等管道(会掩盖退出码),应读取输出或检查 `$?`。

## 提交信息规范

- 采用 Conventional Commits 前缀:`feat` / `fix` / `perf` / `refactor` / `chore` / `docs` / `ci` / `style`,可带作用域,例如 `fix(security): …`、`feat(widget): …`。
- 正文用中文描述动机与做法。
- 每个逻辑改动独立提交。

## 分支与版本

- 在 `main` 之外开工作分支开发,通过 PR 合入。
- 不要在功能提交里改动版本号或打 tag;版本发布由维护者统一处理。

## 安全

发现安全问题请勿公开 issue,按 [SECURITY.md](SECURITY.md) 私下上报。
