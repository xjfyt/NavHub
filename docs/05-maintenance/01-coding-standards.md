# 编码规范

> **对应代码**：全项目
> **维护提示**：修改编码规范时同步更新本文档。

## 1、Rust 规范

### 1.1 命名

- 模块名：`snake_case`
- 类型名：`PascalCase`
- 函数/变量：`snake_case`
- 常量：`SCREAMING_SNAKE_CASE`
- 生命周期：短名（`'a`、`'de`）

### 1.2 序列化

所有面向前端的 serde 结构体使用：

```rust
#[serde(rename_all = "camelCase")]
```

与前端 TypeScript 类型对齐。

### 1.3 错误处理

- 使用 `anyhow::Result` 处理应用错误
- 使用 `thiserror` 定义模块级错误类型
- 不要使用 `unwrap()` 在生产代码中

### 1.4 异步

- `PgPool`（sqlx）是 Send + Sync：可以安全地在异步上下文中共享
- `redis::aio::Connection` 非 Sync：需要在专用任务中使用

### 1.5 注释

- 模块级：`//!` 文档注释
- 公共 API：`///` 文档注释
- 关键逻辑：行内注释说明"为什么"

## 2、TypeScript 规范

### 2.1 命名

- 组件：`PascalCase`
- 函数/变量：`camelCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 类型/接口：`PascalCase`

### 2.2 组件

- 使用函数组件 + Hooks
- Props 接口以 `Props` 后缀命名
- 导出方式：`export default function ComponentName()`

### 2.3 状态管理

- 使用 React 内置状态管理（useState、useReducer）
- 避免过度嵌套状态
- 使用 Context 共享跨组件数据

## 3、Git 提交

```
type(scope): 描述

body 含"原因"与"改动"
```

### 类型

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 |
| `refactor` | 重构 |
| `style` | 样式 |
| `docs` | 文档 |
| `test` | 测试 |
| `chore` | 构建/工具 |

## 4、文档同步

- 修改代码后更新对应文档
- 新增模块时创建对应文档
- 文档头声明"对应代码"和"维护提示"

## 5、代码审查

### 5.1 审查要点

- 代码风格是否符合规范
- 错误处理是否完善
- 性能是否有问题
- 安全性是否考虑

### 5.2 审查流程

1. 提交 Pull Request
2. 自动化检查（CI）
3. 人工审查
4. 合并代码

## 6、测试规范

### 6.1 单元测试

- 每个模块应有对应的测试文件
- 测试覆盖率应达到 80% 以上
- 测试应独立、可重复

### 6.2 集成测试

- 测试模块间的交互
- 测试 API 接口
- 测试数据库操作

## 7、性能规范

### 7.1 前端性能

- 组件懒加载
- 图片懒加载
- 减少不必要的重渲染

### 7.2 后端性能

- 数据库查询优化
- 缓存策略
- 异步处理

## 8、安全规范

### 8.1 输入验证

- 验证所有用户输入
- 防止 SQL 注入
- 防止 XSS 攻击

### 8.2 认证授权

- 使用安全的密码哈希
- 实施适当的权限控制
- 记录安全日志

---
- 上一篇：[04-modules/04-frontend/02-migration.md](../04-modules/04-frontend/02-migration.md)
- 下一篇：[02-add-new-module.md](./02-add-new-module.md)
- 返回索引：[docs/README.md](../README.md)