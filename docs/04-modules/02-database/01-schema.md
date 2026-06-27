# 一、数据库 Schema

> **对应代码**：`backend/migrations/`、`backend/src/models/`
> **维护提示**：修改数据库表结构时同步更新本文档。

PostgreSQL 16+，所有表主键使用 UUID v4（`gen_random_uuid()`，需 `pgcrypto`）。

## 1、表定义（见 `backend/migrations/001_init.sql`）

### 1.1 users

| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| username | TEXT UNIQUE NOT NULL | |
| email | TEXT UNIQUE NOT NULL | |
| display_name | TEXT | |
| avatar_url | TEXT | |
| role | TEXT NOT NULL CHECK in (superadmin,admin,user,guest) | |
| password_hash | TEXT NULL | 仅 superadmin 有值（argon2） |
| casdoor_id | TEXT UNIQUE NULL | Casdoor sub |
| created_at / updated_at / last_seen_at | TIMESTAMPTZ | |

### 1.2 groups

| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| icon | TEXT NOT NULL DEFAULT 'grid' | 侧边栏 icon key |
| owner_id | UUID NULL REFERENCES users ON DELETE CASCADE | NULL=公共/推送 |
| pushed | BOOLEAN NOT NULL DEFAULT FALSE | |
| sort_order | INT NOT NULL DEFAULT 0 | 管理员视角的全局顺序 |
| created_at / updated_at | TIMESTAMPTZ | |

索引：`(owner_id)`, `(pushed) WHERE pushed=true`

### 1.3 icons

| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| name | TEXT NOT NULL | |
| url | TEXT | |
| sub | TEXT | |
| title | TEXT | lg 尺寸专用 |
| cta | TEXT | lg 尺寸专用 |
| size | TEXT NOT NULL DEFAULT 'sq' CHECK in (sq,pill-size,circle-size,lg) | |
| letter | TEXT | |
| color | INT NOT NULL DEFAULT 0 | 0-9 对应 DEFAULT_ICON_COLORS |
| image_url | TEXT | 上传的图片或 favicon URL |
| is_folder | BOOLEAN NOT NULL DEFAULT FALSE | |
| iframe_preview | BOOLEAN NOT NULL DEFAULT FALSE | |
| sort_order | INT NOT NULL DEFAULT 0 | |
| created_at / updated_at | TIMESTAMPTZ | |

索引：`(group_id, sort_order)`

### 1.4 folder_items

| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| folder_icon_id | UUID NOT NULL REFERENCES icons ON DELETE CASCADE | |
| name | TEXT NOT NULL | |
| letter | TEXT | |
| color | INT | |
| url | TEXT | |
| image_url | TEXT | |
| sort_order | INT NOT NULL DEFAULT 0 | |

### 1.5 widgets

| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| widget_type | TEXT NOT NULL | clock/weather/countdown/todo/notes/calendar/rss/music/calc/iframe |
| w_span | INT NOT NULL DEFAULT 1 | |
| w_row | INT | |
| config | JSONB NOT NULL DEFAULT '{}' | widget-specific 配置 |
| sort_order | INT NOT NULL DEFAULT 0 | |
| created_at / updated_at | TIMESTAMPTZ | |

### 1.6 user_preferences

| 列 | 类型 | 说明 |
|---|---|---|
| user_id | UUID PK REFERENCES users ON DELETE CASCADE | |
| tweaks | JSONB NOT NULL DEFAULT '{}' | 见设计稿 `__TWEAKS__` |
| custom_engines | JSONB NOT NULL DEFAULT '{}' | |
| pushed_group_wallpapers | JSONB NOT NULL DEFAULT '{}' | `{group_id: theme}` |
| sidebar_order | UUID[] NOT NULL DEFAULT '{}' | 空数组=跟随全局 sort_order |
| updated_at | TIMESTAMPTZ | |

### 1.7 group_visibility

| 列 | 类型 | 说明 |
|---|---|---|
| role | TEXT NOT NULL | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| PK | (role, group_id) | |

空表含义：对该角色可见所有推送分类（默认全可见）。有记录则以记录为准。

### 1.8 audit_log

| 列 | 类型 |
|---|---|
| id | BIGSERIAL PK |
| ts | TIMESTAMPTZ DEFAULT now() |
| actor_id | UUID NULL |
| actor_name | TEXT |
| action | TEXT NOT NULL |
| target | TEXT |
| kind | TEXT NOT NULL | role/icon/group/auth/system/... |
| detail | JSONB |

索引 `(ts DESC)`, `(kind)`, `(actor_id)`

### 1.9 app_settings

键值存储，运行时可由超管覆盖 `config.toml` 的值。

| 列 | 类型 |
|---|---|
| key | TEXT PK |
| value | JSONB NOT NULL |
| updated_at | TIMESTAMPTZ |

已知 key：`sso`（对象：issuer/client_id/client_secret/redirect_uri/enabled）、`system`（public_access/auto_assign_role/enable_drag/enable_iframe/audit_enabled/dev_mode）、`default_push_groups`.

## 2、种子数据（`002_seed.sql`）

- 初始 5 个推送分类（home/work/tools/media/dev），图标与设计稿 INITIAL_ICONS 保持一致
- 每个推送分类配置 1–2 个组件示例
- superadmin 账号由应用启动时代码创建（而非 SQL），因密码哈希需在代码里算

---
- 上一篇：[01-overview.md](./01-overview.md)
- 下一篇：[03-api/01-overview.md](../03-api/01-overview.md)
- 返回索引：[docs/README.md](../../README.md)# 数据库 Schema

PostgreSQL 16+，所有表主键使用 UUID v4（`gen_random_uuid()`，需 `pgcrypto`）。

## 表定义（见 `backend/migrations/001_init.sql`）

### users
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| username | TEXT UNIQUE NOT NULL | |
| email | TEXT UNIQUE NOT NULL | |
| display_name | TEXT | |
| avatar_url | TEXT | |
| role | TEXT NOT NULL CHECK in (superadmin,admin,user,guest) | |
| password_hash | TEXT NULL | 仅 superadmin 有值（argon2） |
| casdoor_id | TEXT UNIQUE NULL | Casdoor sub |
| created_at / updated_at / last_seen_at | TIMESTAMPTZ | |

### groups
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| icon | TEXT NOT NULL DEFAULT 'grid' | 侧边栏 icon key |
| owner_id | UUID NULL REFERENCES users ON DELETE CASCADE | NULL=公共/推送 |
| pushed | BOOLEAN NOT NULL DEFAULT FALSE | |
| sort_order | INT NOT NULL DEFAULT 0 | 管理员视角的全局顺序 |
| created_at / updated_at | TIMESTAMPTZ | |

索引：`(owner_id)`, `(pushed) WHERE pushed=true`

### icons
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| name | TEXT NOT NULL | |
| url | TEXT | |
| sub | TEXT | |
| title | TEXT | lg 尺寸专用 |
| cta | TEXT | lg 尺寸专用 |
| size | TEXT NOT NULL DEFAULT 'sq' CHECK in (sq,pill-size,circle-size,lg) | |
| letter | TEXT | |
| color | INT NOT NULL DEFAULT 0 | 0-9 对应 DEFAULT_ICON_COLORS |
| image_url | TEXT | 上传的图片或 favicon URL |
| is_folder | BOOLEAN NOT NULL DEFAULT FALSE | |
| iframe_preview | BOOLEAN NOT NULL DEFAULT FALSE | |
| sort_order | INT NOT NULL DEFAULT 0 | |
| created_at / updated_at | TIMESTAMPTZ | |

索引：`(group_id, sort_order)`

### folder_items
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| folder_icon_id | UUID NOT NULL REFERENCES icons ON DELETE CASCADE | |
| name | TEXT NOT NULL | |
| letter | TEXT | |
| color | INT | |
| url | TEXT | |
| image_url | TEXT | |
| sort_order | INT NOT NULL DEFAULT 0 | |

### widgets
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| widget_type | TEXT NOT NULL | clock/weather/countdown/todo/notes/calendar/rss/music/calc/iframe |
| w_span | INT NOT NULL DEFAULT 1 | |
| w_row | INT | |
| config | JSONB NOT NULL DEFAULT '{}' | widget-specific 配置 |
| sort_order | INT NOT NULL DEFAULT 0 | |
| created_at / updated_at | TIMESTAMPTZ | |

### user_preferences
| 列 | 类型 | 说明 |
|---|---|---|
| user_id | UUID PK REFERENCES users ON DELETE CASCADE | |
| tweaks | JSONB NOT NULL DEFAULT '{}' | 见设计稿 `__TWEAKS__` |
| custom_engines | JSONB NOT NULL DEFAULT '{}' | |
| pushed_group_wallpapers | JSONB NOT NULL DEFAULT '{}' | `{group_id: theme}` |
| sidebar_order | UUID[] NOT NULL DEFAULT '{}' | 空数组=跟随全局 sort_order |
| updated_at | TIMESTAMPTZ | |

### group_visibility
| 列 | 类型 | 说明 |
|---|---|---|
| role | TEXT NOT NULL | |
| group_id | UUID NOT NULL REFERENCES groups ON DELETE CASCADE | |
| PK | (role, group_id) | |

空表含义：对该角色可见所有推送分类（默认全可见）。有记录则以记录为准。

### audit_log
| 列 | 类型 |
|---|---|
| id | BIGSERIAL PK |
| ts | TIMESTAMPTZ DEFAULT now() |
| actor_id | UUID NULL |
| actor_name | TEXT |
| action | TEXT NOT NULL |
| target | TEXT |
| kind | TEXT NOT NULL | role/icon/group/auth/system/... |
| detail | JSONB |

索引 `(ts DESC)`, `(kind)`, `(actor_id)`

### app_settings
键值存储，运行时可由超管覆盖 `config.toml` 的值。
| 列 | 类型 |
|---|---|
| key | TEXT PK |
| value | JSONB NOT NULL |
| updated_at | TIMESTAMPTZ |

已知 key：`sso`（对象：issuer/client_id/client_secret/redirect_uri/enabled）、`system`（public_access/auto_assign_role/enable_drag/enable_iframe/audit_enabled/dev_mode）、`default_push_groups`.

## 种子数据（`002_seed.sql`）

- 初始 5 个推送分类（home/work/tools/media/dev），图标与设计稿 INITIAL_ICONS 保持一致
- 每个推送分类配置 1–2 个组件示例
- superadmin 账号由应用启动时代码创建（而非 SQL），因密码哈希需在代码里算
