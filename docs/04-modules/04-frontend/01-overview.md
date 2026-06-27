# 一、前端架构概述

> **对应代码**：`frontend/src/`、`frontend/package.json`
> **维护提示**：前端架构变更时同步更新本文档。

## 1、技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18 | UI 框架 |
| TypeScript | 5 | 类型安全 |
| Vite | 5 | 构建工具 |
| @dnd-kit | - | 拖拽功能 |
| Tailwind CSS | - | 样式框架 |
| sonner | - | Toast 通知 |

## 2、目录结构

```
frontend/src/
├── components/          # UI 组件
│   ├── add-icon-modal/  # 添加图标模态框
│   ├── admin/           # 管理后台组件
│   ├── tweaks/          # 设置面板组件
│   ├── Shell.tsx        # 主外壳组件
│   ├── Sidebar.tsx      # 侧边栏组件
│   ├── NavView.tsx      # 导航视图组件
│   ├── Icon.tsx         # 图标组件
│   ├── IconTile.tsx     # 图标磁贴组件
│   ├── FolderOverlay.tsx # 文件夹覆盖层
│   ├── SearchBar.tsx    # 搜索栏组件
│   ├── Modal.tsx        # 模态框组件
│   └── ...              # 其他组件
├── hooks/               # 自定义 Hooks
├── utils/               # 工具函数
├── widgets/             # 小组件
├── i18n/                # 国际化
├── constants/           # 常量定义
├── App.tsx              # 应用入口组件
├── main.tsx             # 主入口文件
├── api.ts               # API 客户端
├── types.ts             # 类型定义
├── LoginScreen.tsx      # 登录页面
├── WorkspaceScreen.tsx  # 工作区页面
├── ChangePasswordScreen.tsx # 修改密码页面
├── shell.css            # 外壳样式
└── styles.css           # 全局样式
```

## 3、核心架构

### 3.1 应用入口

```typescript
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 3.2 应用组件

```typescript
// App.tsx
export function App() {
  const [state, setState] = useState<BootState>(() => {
    // 初始化状态
    return { stage: "ready", status: null, me: null, workspace: emptyWorkspace() };
  });

  const boot = useCallback(async () => {
    // 启动逻辑：获取状态、工作区数据
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // 渲染逻辑
}
```

### 3.3 状态管理

使用 React 内置状态管理：

- `useState`：组件状态
- `useReducer`：复杂状态逻辑
- `useCallback`：记忆化回调
- `useEffect`：副作用处理

## 4、组件架构

### 4.1 组件层次

```
App
├── WorkspaceScreen (工作区主界面)
│   ├── Shell (外壳)
│   │   ├── Sidebar (侧边栏)
│   │   ├── NavView (导航视图)
│   │   └── SearchBar (搜索栏)
│   └── 各种模态框
├── LoginScreen (登录页面)
└── ChangePasswordScreen (修改密码页面)
```

### 4.2 组件通信

- **Props 传递**：父组件向子组件传递数据
- **回调函数**：子组件向父组件传递事件
- **Context**：跨组件共享数据（如主题、语言）

## 5、API 客户端

### 5.1 API 封装

```typescript
// api.ts
class ApiClient {
  private baseUrl = '/api';

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...options,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.json());
    }

    return response.json();
  }

  // 具体 API 方法
  async status(): Promise<AuthStatus> { /* ... */ }
  async workspace(): Promise<Workspace> { /* ... */ }
  async me(): Promise<Me> { /* ... */ }
  // ...
}

export const api = new ApiClient();
```

### 5.2 错误处理

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public data: { error: string; message: string }
  ) {
    super(data.message);
  }
}
```

## 6、样式系统

### 6.1 Tailwind CSS 配置

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#6b7280',
      },
    },
  },
  plugins: [],
};
```

### 6.2 CSS 变量

```css
:root {
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --secondary: #6b7280;
  --accent: #f59e0b;
}
```

## 7、构建与开发

### 7.1 开发模式

```bash
cd frontend && npm run dev
# 启动 Vite 开发服务器，端口 5173
```

### 7.2 生产构建

```bash
cd frontend && npm run build
# 产物输出到 frontend/dist/
```

### 7.3 类型检查

```bash
cd frontend && npm run lint
# TypeScript 类型检查
```

## 8、性能优化

### 8.1 代码分割

使用 React.lazy 和 Suspense 实现代码分割：

```typescript
const LazyComponent = React.lazy(() => import('./LazyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </Suspense>
  );
}
```

### 8.2 缓存策略

- **SWR 缓存**：本地存储工作区数据
- **请求缓存**：避免重复请求
- **图片懒加载**：延迟加载非可见图片

## 9、调试与测试

### 9.1 开发工具

- React Developer Tools
- Vite 开发服务器
- TypeScript 类型检查

### 9.2 测试框架

- 单元测试：Vitest
- 组件测试：React Testing Library
- E2E 测试：Playwright

---
- 上一篇：[03-api/01-overview.md](../03-api/01-overview.md)
- 下一篇：[02-migration.md](./02-migration.md)
- 返回索引：[docs/README.md](../../README.md)