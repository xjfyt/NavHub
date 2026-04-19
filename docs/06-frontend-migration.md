# 前端 · 设计稿迁移计划

设计原稿位于 `~/Downloads/navigation/project/`,共约 4300 行代码,由多个 JSX 文件组成。
本文档记录当前已迁移的部分与待迁移的部分,以便后续继续推进。

## 已完成 (M1 · 最小可用骨架)

- Vite 5 + React 18 + TypeScript 5 工程 (`frontend/`)
- 全量拷贝设计 `styles.css` (1640 行) 至 `frontend/src/styles.css`
- 顶层骨架 + 真实 API 接入
  - `src/main.tsx` · 入口
  - `src/App.tsx` · 启动引导 (`/auth/status` → `/api/me` + `/api/workspace`)
  - `src/LoginScreen.tsx` · Casdoor SSO / 超管密码双登录
  - `src/WorkspaceScreen.tsx` · 侧边栏 + 分类内容 + 图标/小组件骨架
  - `src/api.ts` · 全量后端 API 客户端 (含 admin)
  - `src/types.ts` · 与后端 `*View` 严格对齐的 TS 类型
  - `src/shell.css` · 骨架专用样式 (叠加在 `styles.css` 之上)
- `vite.config.ts` 代理 `/api` `/auth` `/uploads` 到 `127.0.0.1:8088`

## 待迁移 (M2 · 完整设计复刻)

源文件 → 目标文件,按优先级排序:

| 源 JSX | 目标 TSX | 说明 |
| --- | --- | --- |
| `app.jsx` (1041行) | `components/Shell.tsx` + `hooks/useTweaks.ts` | 主应用壳,搜索栏,滚轮翻页,快捷键,编辑态,右键菜单 |
| `icons.jsx` (54行) | `components/Icon/*.tsx` | 四形状图标 (sq / pill / circle / lg) + 文件夹 mini-grid |
| `widgets.jsx` (297行) | `components/Widgets/*.tsx` | 10 类 Widget (clock / weather / hot / rss / calendar / etc.) |
| `background.jsx` (11行) | `components/Background.tsx` | 主题背景切换 |
| `modals.jsx` (160行) | `components/Modals/*.tsx` | 图标编辑器 / 分类编辑器 / 上传弹层 |
| `tweaks.jsx` (305行) | `components/TweaksPanel.tsx` | 右侧偏好设置面板 |
| `sso.jsx` (78行) | `components/admin/SsoPanel.tsx` | SSO 配置面板 (调用 `/api/admin/sso`) |
| `admin.jsx` (447行) | `components/admin/*.tsx` | 用户 / 推送 / 权限 / 审计日志面板 |
| `data.jsx` (145行) | `constants/design.ts` | 纯常量 (调色板,图标,角色描述) |

### 迁移原则

1. **禁止迁移 mock 数据**
   - 所有 `INITIAL_*` 种子数据已由后端 `002_seed.sql` 注入,前端必须从 `/api/workspace` 读取。
   - `INITIAL_USERS` `AUDIT_LOG` `RSS_ITEMS` 等 mock 一律删除,改为调用对应 API。
2. **禁止保留 RoleSwitcher 与模拟 SSO**
   - 原设计顶部的角色切换器 (超管/管理员/普通用户/访客) 为演示,实际角色来自 `/api/me`。
3. **所有 `#` 占位链接** 保持原样,用户可在编辑模式中填入真实地址。
4. **持久化偏好** (tweaks / customEngines / pushedGroupWallpapers / sidebarOrder)
   必须通过 `PATCH /api/me/preferences` 保存,不要用 localStorage。
5. **图标点击跳转** 遵循 `tweaks.iconOpen`:`newtab` (默认) 或 `same`。
6. **推送分类** 的 `readOnly` 标记须严格禁用编辑/拖拽/删除 UI,但允许换壁纸与拖动侧边栏顺序。

### 推荐推进顺序

1. `constants/design.ts` — 提取色板/角色描述/图标 Map,替换 `data.jsx` 中的非 mock 部分
2. `components/Background.tsx` + `components/Icon/*.tsx` — 视觉基础
3. `components/Widgets/*.tsx` — 对接 `/api/widgets/weather`, `/api/widgets/hot`
4. `components/Shell.tsx` — 重写 `app.jsx` 主结构,接 `useWorkspace` + `useTweaks`
5. `components/Modals/*.tsx` — 图标/分类编辑流,调用 `api.createIcon/updateIcon/...`
6. `components/TweaksPanel.tsx` — 调用 `api.patchPrefs`
7. `components/admin/*` — 管理后台,调用 `api.admin.*`

### 关键注意

- 原设计 `src/app.jsx` 使用全局 `window.__TWEAKS__` 持久化,迁移时改为 `api.patchPrefs`。
- 原设计全局 `window.LUMEN_DATA`,迁移时改为 React Context + `api.workspace()`。
- 原设计用 `document.execCommand` 触发下载,保留即可。
- 原 `sso.jsx` 的连接测试按钮暂未实现,后端可新增 `POST /api/admin/sso/test` 真实探测 Casdoor。

## 开发命令

```bash
# 首次 (或重装依赖)
cd frontend && pnpm install

# 本地开发 (后端 + 前端同时)
./dev.sh

# 单独前端
cd frontend && pnpm dev      # http://127.0.0.1:5173

# 打包
cd frontend && pnpm build    # 输出到 frontend/dist,后端自动托管
```
