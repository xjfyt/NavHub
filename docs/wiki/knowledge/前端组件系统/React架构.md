# React 架构设计

## 技术栈
- React 18
- TypeScript 5
- Vite 5
- @dnd-kit（拖拽）
- Tailwind CSS

## 应用入口

### main.tsx
```tsx
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

### App.tsx
顶层组件，管理启动流程和全局状态。

```tsx
export function App() {
  const [state, setState] = useState<BootState>(() => {
    return { stage: "ready", status: null, me: null, workspace: emptyWorkspace() };
  });

  const boot = useCallback(async () => {
    // 启动逻辑：获取状态、工作区数据
  }, []);

  useEffect(() => { void boot(); }, [boot]);

  // 渲染逻辑
}
```

## 组件层次

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

## 状态管理

使用 React 内置状态管理：
- useState：组件状态
- useReducer：复杂状态逻辑
- useCallback：记忆化回调
- useEffect：副作用处理

## 组件通信

- **Props 传递**：父组件向子组件传递数据
- **回调函数**：子组件向父组件传递事件
- **Context**：跨组件共享数据（如主题、语言）

## API 客户端

```typescript
class ApiClient {
  private baseUrl = '/api';

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...options,
    });
    if (!response.ok) throw new ApiError(response.status, await response.json());
    return response.json();
  }
}

export const api = new ApiClient();
```

## 错误处理

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

## 性能优化

- 代码分割：React.lazy + Suspense
- 图片懒加载
- 请求缓存
- 减少不必要的重渲染

## 构建

```bash
# 开发
cd frontend && npm run dev

# 生产
cd frontend && npm run build
# 产物输出到 frontend/dist/
```
