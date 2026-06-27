# NavHub 文档索引

> 个人/团队导航页服务（Rust + React）技术文档集

---

## 一、文档导航

| 目录 | 内容 | 适合谁读 |
|------|------|----------|
| [01-overview/](./01-overview/) | 项目定位、架构、技术栈 | 所有人 |
| [02-getting-started/](./02-getting-started/) | 构建、运行、数据目录 | 新人 / 运维 |
| [03-config/](./03-config/) | 配置文件、环境变量 | 前端开发 / 运维 |
| [04-modules/](./04-modules/) | 各模块深度文档 | 模块开发者 |
| [05-maintenance/](./05-maintenance/) | 编码规范、新增模块指南、排障、路线图 | 贡献者 / 维护者 |
| [06-conventions/](./06-conventions/) | 文档编写规范 | 文档贡献者 |
| [07-deployment/](./07-deployment/) | 部署、备份、CDN 配置 | 运维 / 后端 |
| [superpowers/](./superpowers/) | 计划、规格文档 | 架构师 / 开发者 |

## 二、推荐阅读路径

### 新人入门

1. [01-overview/01-introduction.md](./01-overview/01-introduction.md) — 项目是什么
2. [01-overview/02-architecture.md](./01-overview/02-architecture.md) — 整体架构
3. [02-getting-started/01-build.md](./02-getting-started/01-build.md) — 构建项目
4. [02-getting-started/02-run-and-deploy.md](./02-getting-started/02-run-and-deploy.md) — 运行与部署

### 后端开发者

1. [01-overview/02-architecture.md](./01-overview/02-architecture.md) — 架构总览
2. [04-modules/01-auth/01-overview.md](./04-modules/01-auth/01-overview.md) — 认证子系统
3. [04-modules/02-database/01-overview.md](./04-modules/02-database/01-overview.md) — 数据库模块
4. [04-modules/03-api/01-overview.md](./04-modules/03-api/01-overview.md) — API 接口
5. [05-maintenance/01-coding-standards.md](./05-maintenance/01-coding-standards.md) — 编码规范

### 前端开发者

1. [01-overview/02-architecture.md](./01-overview/02-architecture.md) — 架构总览
2. [04-modules/04-frontend/01-overview.md](./04-modules/04-frontend/01-overview.md) — 前端架构
3. [03-config/01-config-file.md](./03-config/01-config-file.md) — 配置文件
4. [04-modules/05-widgets/01-overview.md](./04-modules/05-widgets/01-overview.md) — 小组件系统

### 运维人员

1. [02-getting-started/02-run-and-deploy.md](./02-getting-started/02-run-and-deploy.md) — 运行与部署
2. [07-deployment/01-docker.md](./07-deployment/01-docker.md) — Docker 部署
3. [07-deployment/02-backup-restore.md](./07-deployment/02-backup-restore.md) — 备份恢复
4. [07-deployment/03-cdn-cloudflare.md](./07-deployment/03-cdn-cloudflare.md) — CDN 配置

## 三、文档编写规范

详见 [06-conventions/01-doc-writing-rules.md](./06-conventions/01-doc-writing-rules.md)，核心要点：

### 标题层级

- H1（`#`）：一、二、三、……
- H2（`##`）：1、2、3、……
- H3（`###`）：（1）（2）（3）……
- H4（`####`）：①、②、③、……

### 文件头元数据

每个文档开头包含代码对应关系与维护提示：

```markdown
> **对应代码**：`backend/src/auth/mod.rs`
> **维护提示**：修改认证逻辑时同步更新本文档。
```

### 文件尾导航

每个文档末尾包含前后篇链接和索引返回：

```markdown
---
- 上一篇：[xx-xxx.md](./xx-xxx.md)
- 下一篇：[yy-yyy.md](./yy-yyy.md)
- 返回索引：[docs/README.md](../README.md)
```

### 交叉引用

- 文档间引用：`[01-auth/01-overview.md](./04-modules/01-auth/01-overview.md)`
- 指向代码：`[mod.rs](../../backend/src/auth/mod.rs)`
- 指向章节：`§三、（2）`

## 四、代码 ↔ 文档双向连接规则

| 代码变更 | 文档操作 |
|----------|----------|
| 新增 / 重命名模块 | 更新 [04-modules/01-overview.md](./04-modules/01-overview.md)，新增对应子文档 |
| 修改认证逻辑 | 更新 [04-modules/01-auth/](./04-modules/01-auth/) 下对应文档 |
| 新增 / 修改 API | 更新 [04-modules/03-api/01-overview.md](./04-modules/03-api/01-overview.md) |
| 修改数据库 schema | 更新 [04-modules/02-database/01-schema.md](./04-modules/02-database/01-schema.md) |
| 修改配置常量 | 更新 [03-config/](./03-config/) 下对应文档 |
| 修改前端组件 | 更新 [04-modules/04-frontend/01-overview.md](./04-modules/04-frontend/01-overview.md) |

---
- 返回：[README.md](../README.md)