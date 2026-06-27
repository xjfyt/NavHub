# 新增模块指南

> **对应代码**：`backend/src/handlers/`、`backend/src/models/`
> **维护提示**：修改新增模块流程时同步更新本文档。

## 1、后端新增模块

### （1）创建模型文件

```
backend/src/models/my_model.rs
```

定义数据结构：

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MyModel {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### （2）在 models/mod.rs 注册

```rust
pub mod my_model;
```

### （3）创建处理器文件

```
backend/src/handlers/my_handler.rs
```

实现 API 处理器：

```rust
use axum::{extract::State, Json};
use crate::state::AppState;
use crate::error::AppResult;
use super::my_model::MyModel;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<MyModel>>> {
    let items = sqlx::query_as::<_, MyModel>("SELECT * FROM my_models")
        .fetch_all(&state.pg)
        .await?;
    Ok(Json(items))
}
```

### （4）在 handlers/mod.rs 注册

```rust
pub mod my_handler;
```

### （5）添加路由

在 `backend/src/routes.rs` 中添加路由：

```rust
.route("/api/my-models", get(handlers::my_handler::list))
```

### （6）创建数据库迁移

创建 `backend/migrations/033_my_model.sql`：

```sql
CREATE TABLE my_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2、前端新增页面

### （1）创建组件

```
frontend/src/components/MyPage.tsx
```

实现组件：

```typescript
import { useState, useEffect } from 'react';
import { api } from '../api';

interface MyModel {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function MyPage() {
  const [items, setItems] = useState<MyModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.myModels().then(setItems).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {items.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

### （2）在 App.tsx 中路由

添加路由条件或导航入口。

### （3）添加 i18n 翻译

在 `frontend/src/i18n/` 下添加翻译 key。

## 3、新增小部件

### （1）创建小部件文件

```
frontend/src/widgets/MyWidget.tsx
```

实现小部件组件：

```typescript
import { WidgetProps } from '../types';

export function MyWidget({ config }: WidgetProps) {
  return (
    <div className="widget">
      <h3>My Widget</h3>
      <p>{config.text}</p>
    </div>
  );
}
```

### （2）注册到小部件表

在 `frontend/src/widgets/index.ts` 中添加：

```typescript
import { MyWidget } from './MyWidget';

export const widgets = {
  // ... 其他小部件
  myWidget: MyWidget,
};
```

## 4、文档同步

新增模块后：

1. 更新 [04-modules/01-overview.md](../04-modules/01-overview.md)
2. 创建对应子文档目录和文件
3. 文档头添加"对应代码"和"维护提示"

## 5、测试

### 5.1 后端测试

为新增模块编写单元测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_my_model() {
        // 测试逻辑
    }
}
```

### 5.2 前端测试

为新增组件编写测试：

```typescript
import { render, screen } from '@testing-library/react';
import { MyPage } from './MyPage';

test('renders my page', () => {
  render(<MyPage />);
  // 断言
});
```

---
- 上一篇：[01-coding-standards.md](./01-coding-standards.md)
- 下一篇：[03-troubleshooting.md](./03-troubleshooting.md)
- 返回索引：[docs/README.md](../README.md)