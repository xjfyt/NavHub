# 一、数据库模块概述

> **对应代码**：`backend/src/db.rs`、`backend/migrations/`
> **维护提示**：数据库逻辑变更时同步更新本文档。

## 1、模块结构

```
backend/src/
├── db.rs            # 数据库连接与迁移
├── models/          # 数据模型
│   ├── mod.rs
│   ├── user.rs
│   ├── group.rs
│   ├── icon.rs
│   ├── widget.rs
│   ├── wallpaper.rs
│   ├── message.rs
│   ├── prefs.rs
│   ├── audit.rs
│   ├── export.rs
│   └── icon_asset.rs
└── migrations/      # 数据库迁移文件
    ├── 001_init.sql
    ├── 002_seed.sql
    ├── ...
    └── 032_expires_partial_indexes.sql
```

## 2、数据库连接

### 2.1 连接池配置

```rust
let pool = PgPoolOptions::new()
    .max_connections(cfg.max_connections)  // 最大连接数
    .min_connections(1)                    // 最小连接数
    .acquire_timeout(Duration::from_secs(10))  // 获取连接超时
    .idle_timeout(Some(Duration::from_secs(300)))  // 空闲超时
    .max_lifetime(Some(Duration::from_secs(1800)))  // 最大生命周期
    .test_before_acquire(true)  // 获取前测试连接
    .connect_with(opts)
    .await?;
```

### 2.2 自动创建数据库

如果目标数据库不存在，系统会自动创建：

```rust
async fn ensure_database(cfg: &DatabaseConfig) -> anyhow::Result<()> {
    match PgConnection::connect(&cfg.dsn()).await {
        Ok(c) => {
            let _ = c.close().await;
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("does not exist") || msg.contains("3D000") {
                // 创建数据库
                let mut admin = PgConnection::connect(&cfg.admin_dsn()).await?;
                let sql = format!("CREATE DATABASE \"{}\"", cfg.database.replace('"', "\"\""));
                sqlx::query(&sql).execute(&mut admin).await?;
                let _ = admin.close().await;
                Ok(())
            } else {
                Err(e.into())
            }
        }
    }
}
```

## 3、数据库迁移

### 3.1 迁移文件

迁移文件位于 `backend/migrations/` 目录，按编号顺序执行：

| 迁移文件 | 说明 |
|----------|------|
| `001_init.sql` | 初始化表结构 |
| `002_seed.sql` | 种子数据 |
| `003_messages.sql` | 消息表 |
| `004_icon_image_style.sql` | 图标样式 |
| `005_group_push_targets.sql` | 分类推送目标 |
| ... | ... |
| `032_expires_partial_indexes.sql` | 过期部分索引 |

### 3.2 迁移策略

系统采用宽松的迁移策略：

- 跳过已应用的迁移版本
- 检测磁盘上重复的版本号
- 检测已记录的 checksum 与磁盘文件不一致
- 生产环境直接失败，开发环境仅警告

### 3.3 迁移完整性检查

```rust
fn check_migration_integrity(
    on_disk: &[(i64, &[u8])],
    recorded: &[(i64, Vec<u8>)],
) -> Result<(), Vec<String>> {
    // 1. 检测磁盘重复版本号
    // 2. 检测已记录 checksum 与磁盘同版本不一致
    // 数据库中记录但磁盘上已不存在的版本不视为错误
}
```

## 4、数据模型

### 4.1 用户模型

```rust
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub role: Role,
    pub password_hash: Option<String>,
    pub must_change_password: bool,
    pub casdoor_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### 4.2 分类模型

```rust
pub struct Group {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Option<Uuid>,
    pub pushed: bool,
    pub allow_edit: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### 4.3 图标模型

```rust
pub struct Icon {
    pub id: Uuid,
    pub group_id: Uuid,
    pub title: String,
    pub url: String,
    pub icon_url: Option<String>,
    pub icon_type: IconType,
    pub grid_x: i32,
    pub grid_y: i32,
    pub grid_w: i32,
    pub grid_h: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

## 5、数据库操作

### 5.1 查询示例

```rust
// 查询用户
let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
    .bind(user_id)
    .fetch_optional(&state.pg)
    .await?;

// 查询分类列表
let groups = sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE owner_id = $1 OR pushed = true")
    .bind(user_id)
    .fetch_all(&state.pg)
    .await?;
```

### 5.2 事务处理

```rust
let mut tx = state.pg.begin().await?;

// 在事务中执行多个操作
sqlx::query("INSERT INTO ...")
    .execute(&mut *tx)
    .await?;

sqlx::query("UPDATE ...")
    .execute(&mut *tx)
    .await?;

tx.commit().await?;
```

## 6、性能优化

### 6.1 索引策略

- 为常用查询字段创建索引
- 使用复合索引优化多条件查询
- 定期分析查询性能

### 6.2 连接池调优

- 根据并发量调整 `max_connections`
- 设置合理的 `idle_timeout` 和 `max_lifetime`
- 启用 `test_before_acquire` 确保连接可用性

## 7、备份与恢复

详见 [07-deployment/02-backup-restore.md](../../07-deployment/02-backup-restore.md)。

---
- 上一篇：[01-auth/02-permissions.md](../01-auth/02-permissions.md)
- 下一篇：[01-schema.md](./01-schema.md)
- 返回索引：[docs/README.md](../../README.md)