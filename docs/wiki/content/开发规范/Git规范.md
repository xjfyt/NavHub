---
title: Git提交和分支规范
description: NavHub项目Git提交信息格式、分支策略和代码审查流程
keywords: Git, 提交规范, 分支策略, 代码审查, CI/CD
author: NavHub Team
last_updated: 2026-06-27
category: 开发规范
nav_order: 2
---

# Git提交和分支规范

> **对应代码**：`.github/workflows/ci.yml`、`.github/workflows/docker.yml`
> **维护提示**：Git工作流变更时同步更新本文档。

## 1. 提交信息规范

### 1.1 格式

```
type(scope): 描述

body含"原因"与"改动"（可选）
```

### 1.2 类型（type）

| type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): 添加OIDC登录支持` |
| `fix` | 修复 | `fix(api): 修复分组排序bug` |
| `refactor` | 重构 | `refactor(db): 优化查询逻辑` |
| `style` | 样式 | `style(frontend): 调整按钮颜色` |
| `docs` | 文档 | `docs: 更新部署文档` |
| `test` | 测试 | `test(auth): 添加登录测试用例` |
| `chore` | 构建/工具 | `chore(ci): 更新GitHub Actions` |
| `perf` | 性能 | `perf(cache): 优化Redis缓存策略` |

### 1.3 范围（scope）

可选，标识影响的模块：
- `auth` - 认证模块
- `api` - API接口
- `db` - 数据库
- `frontend` - 前端
- `ci` - CI/CD
- `docker` - Docker配置

## 2. 分支策略

### 2.1 分支命名

| 分支类型 | 命名格式 | 示例 |
|---------|---------|------|
| 主分支 | `main` | - |
| 功能分支 | `feat/描述` | `feat/oidc-login` |
| 修复分支 | `fix/描述` | `fix/sort-bug` |
| 热修复 | `hotfix/描述` | `hotfix/security-patch` |
| 文档 | `docs/描述` | `docs/wiki-update` |

### 2.2 分支流程

1. 从 `main` 创建功能/修复分支
2. 在分支上开发并提交
3. 创建Pull Request
4. CI自动化检查通过
5. 代码审查通过
6. 合并到 `main`
7. 删除功能分支

## 3. 代码审查

### 3.1 审查要点

- 代码风格是否符合编码规范
- 错误处理是否完善（无裸unwrap）
- 安全性是否考虑（输入验证、权限检查）
- 是否有性能问题（N+1查询、不必要的克隆）
- 测试是否充分

### 3.2 审查流程

1. 提交Pull Request，填写变更说明
2. 等待CI自动化检查（编译、测试、lint）
3. 至少一位审查者批准
4. 合并代码（推荐squash merge保持历史清洁）

## 4. CI/CD 流程

NavHub使用GitHub Actions进行持续集成和部署。

### 4.1 CI流程（ci.yml）

每个PR和main分支推送时自动触发：

1. **Rust后端检查**
   - `cargo fmt --check` 代码格式检查
   - `cargo clippy` 静态分析
   - `cargo test` 单元测试

2. **前端检查**
   - `npm run lint` ESLint检查
   - `npm run build` 构建验证

### 4.2 Docker构建（docker.yml）

main分支推送时自动构建Docker镜像：

```yaml
# 自动构建多架构镜像（amd64/arm64）
# 推送到GitHub Container Registry
```

### 4.3 提交前自检

```bash
# 后端
cd backend
cargo fmt
cargo clippy -- -D warnings
cargo test

# 前端
cd frontend
npm run lint
npm run build
```

## 5. 版本发布

- 使用语义化版本号（SemVer）：`MAJOR.MINOR.PATCH`
- 重大变更需在CHANGELOG.md中记录
- 发布时创建Git Tag

---

- 上一篇：[编码规范](./编码规范.md)
- 下一篇：[文档规范](./文档规范.md)
- 返回目录：[开发规范](./README.md)
