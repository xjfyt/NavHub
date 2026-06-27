# PostgreSQL 设计

## 概述
NavHub 使用 PostgreSQL 15+ 作为主数据库，所有表主键使用 UUID v4（gen_random_uuid()，需 pgcrypto 扩展）。

## 连接池配置

```rust
let pool = PgPoolOptions::new()
    .max_connections(cfg.max_connections)
    .min_connections(1)
    .acquire_timeout(Duration::from_secs(10))
    .idle_timeout(Some(Duration::from_secs(300)))
    .max_lifetime(Some(Duration::from_secs(1800)))
    .test_before_acquire(true)
    .connect_with(opts)
    .await?;
```

## 核心表结构

### users 用户表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| username | TEXT UNIQUE NOT NULL | 用户名 |
| email | TEXT UNIQUE NOT NULL | 邮箱 |
| display_name | TEXT | 显示名称 |
| avatar_url | TEXT | 头像URL |
| role | TEXT NOT NULL | 角色: superadmin/admin/user/guest |
| password_hash | TEXT NULL | 仅 superadmin 有值（argon2） |
| casdoor_id | TEXT UNIQUE NULL | Casdoor sub |
| created_at / updated_at / last_seen_at | TIMESTAMPTZ | 时间戳 |

### groups 分类表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| name | TEXT NOT NULL | 分类名称 |
| icon | TEXT NOT NULL DEFAULT 'grid' | 侧边栏 icon key |
| owner_id | UUID NULL | NULL=公共/推送 |
| pushed | BOOLEAN NOT NULL DEFAULT FALSE | 是否为推送分类 |
| sort_order | INT NOT NULL DEFAULT 0 | 排序顺序 |

### icons 图标表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| group_id | UUID NOT NULL | 所属分类 |
| name | TEXT NOT NULL | 图标名称 |
| url | TEXT | 链接地址 |
| size | TEXT NOT NULL DEFAULT 'sq' | sq/pill-size/circle-size/lg |
| letter | TEXT | 首字母 |
| color | INT NOT NULL DEFAULT 0 | 颜色索引 0-9 |
| image_url | TEXT | 图标图片URL |
| is_folder | BOOLEAN NOT NULL DEFAULT FALSE | 是否为文件夹 |
| sort_order | INT NOT NULL DEFAULT 0 | 排序顺序 |

### widgets 小组件表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| group_id | UUID NOT NULL | 所属分类 |
| widget_type | TEXT NOT NULL | 类型: clock/weather/countdown/todo等 |
| w_span | INT NOT NULL DEFAULT 1 | 宽度 |
| config | JSONB NOT NULL DEFAULT '{}' | 组件配置 |
| sort_order | INT NOT NULL DEFAULT 0 | 排序顺序 |

### user_preferences 用户偏好表
| 列 | 类型 | 说明 |
|---|---|---|
| user_id | UUID PK | 用户ID |
| tweaks | JSONB NOT NULL DEFAULT '{}' | 个性化设置 |
| custom_engines | JSONB NOT NULL DEFAULT '{}' | 自定义搜索引擎 |
| pushed_group_wallpapers | JSONB NOT NULL DEFAULT '{}' | 推送分类壁纸 |
| sidebar_order | UUID[] NOT NULL DEFAULT '{}' | 侧边栏顺序 |

### audit_log 审计日志表
| 列 | 类型 | 说明 |
|---|---|---|
| id | BIGSERIAL PK | 主键 |
| ts | TIMESTAMPTZ DEFAULT now() | 时间戳 |
| actor_id | UUID NULL | 操作者ID |
| action | TEXT NOT NULL | 操作类型 |
| target | TEXT | 操作目标 |
| kind | TEXT NOT NULL | 日志类别 |
| detail | JSONB | 详细信息 |

### app_settings 应用设置表
键值存储，运行时可由超管覆盖 config.toml 的值。
| 列 | 类型 | 说明 |
|---|---|---|
| key | TEXT PK | 设置键 |
| value | JSONB NOT NULL | 设置值 |

## 迁移策略

- 迁移文件位于 backend/migrations/，按编号顺序执行
- 跳过已应用的迁移版本
- 检测磁盘上重复的版本号
- 检测已记录的 checksum 与磁盘文件不一致
- 生产环境直接失败，开发环境仅警告

## 查询示例

```rust
let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
    .bind(user_id)
    .fetch_optional(&state.pg)
    .await?;

let groups = sqlx::query_as::<_, Group>(
    "SELECT * FROM groups WHERE owner_id = $1 OR pushed = true"
)
    .bind(user_id)
    .fetch_all(&state.pg)
    .await?;
```

## 事务处理

```rust
let mut tx = state.pg.begin().await?;
sqlx::query("INSERT INTO ...").execute(&mut *tx).await?;
sqlx::query("UPDATE ...").execute(&mut *tx).await?;
tx.commit().await?;
```
