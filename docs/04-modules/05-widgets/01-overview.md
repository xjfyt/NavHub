# 一、小组件设计规范

> **对应代码**：`frontend/src/widgets/`、`backend/src/handlers/widgets/`
> **维护提示**：小组件规范变更时同步更新本文档。

NavHub 的小组件（widget）承担"随手可查、随手可改"的轻量面板职责。本文定义所有内置与后续新增小组件必须满足的设计与实现规范，确保体验一致、易用、可扩展。

## 1、三条基本原则（用户强制要求）

### 1.1 可交互

小组件不是单纯的信息橱窗。每个小组件在自身磁贴内至少提供一种用户可直接操作的能力：
- 输入/写入：如待办、便签。
- 控制/状态切换：如音乐播放、番茄钟启停。
- 数据切换：如热搜切换来源、一言换一句。
- 链接跳转：如热搜条目跳到原站。
- 无控制型小组件（时钟、年进度）至少在点击时有反馈（打开详情）。

### 1.2 点击展开详情

小组件磁贴本身即为可点击区域——鼠标点击磁贴任意空白处即打开详情 Modal：
- 在注册表提供 `renderDetail`，Shell/NavView 会自动给该磁贴加上 `.expandable` 样式与 `onClick` 处理器；右上角 hover 显示 `⤢` 小提示图标纯作视觉提示。
- 弹出**居中 Modal**，背后遮罩；点击遮罩或 `Esc` 关闭。
- 展示"更多详情"：比磁贴更大、更完整的数据视图，信息密度更高、可编辑能力更强。
- Modal 宽度建议 `min(720px, 90vw)`，高度自适应不超过 `80vh`，内部可滚动。
- **内部交互控件（按钮、输入框、超链接、可编辑区域）必须 `e.stopPropagation()` 或使用原生 `<button>/<a>/<input>/<textarea>`**，否则点击会穿透触发展开。NavView 对常见原生标签已做自动排除；非原生的 `<div onClick>` 务必 `stopPropagation`。
- 若小组件"本身即是完整交互"（计算器、嵌入网页），不要提供 `renderDetail` —— 无 `renderDetail` 的磁贴不会点击展开，右键/内部交互仍正常。

### 1.3 用户配置持久化

任何用户可修改的状态都必须通过 `useWidgetConfig` 写入 `widgets.config` JSONB 字段：
- 本地即时更新 + 600ms 防抖持久化。
- 登录用户：写入数据库，跨设备/跨刷新保留。
- 游客用户：纯内存，页面刷新丢失（且不触发 401）。
- 不得把用户数据放在 `useState`/`localStorage` 里绕过统一持久化。

### 1.4 必须注册到小组件目录（可添加、可搜索）

每个小组件必须在 `frontend/src/widgets/index.tsx` 的 `WIDGET_REGISTRY` 注册，否则"添加小组件"弹窗里不会出现，用户无法使用：

- 必填 `id`（英文小写，短横线分隔）、`name`（中文短名）、`description`（≤ 40 字的一句话介绍）、`icon`（Lucide 图标名）、`span`（1 或 2）、`render`。
- 名称与描述同时作为**搜索关键字**：用户在 `WidgetCatalogModal` 搜索框输入时会匹配 `name` 和 `description`（命中任一即展示）。因此描述里要自然覆盖用户可能用的关键词（如番茄钟描述里带"计时器"、"专注"等）。
- 在 `DEMO_CONFIG` 提供一份代表性的默认配置，目录里缩略预览更真实。
- 新组件增加后，在本文的"新增小组件清单"里打勾确认注册与搜索命中。

---

## 2、扩展规范（基于原则衍生）

### 2.1 统一结构

每个小组件必须使用标准外层骨架：

```tsx
<div className="widget w-<kind>">
  <div className="widget-header">
    <span className="widget-title">{主标题}</span>
    <span className="muted mono" style={{ fontSize: 10 }}>{副状态}</span>
  </div>
  {主体内容}
</div>
```

- `widget-title` 短、明确，支持动态（如"热搜 · 微博"）。
- 副状态只显示一类信息：状态标签（`LOADING` / `UPDATED` / `ERROR`）或计数（`12/20`、`DAY 158`）。

### 2.2 加载 / 错误 / 空三态

异步加载的小组件必须分别处理：
- **Loading**：副状态显示 `LOADING`；主体区展示骨架或灰色占位（不要空白）。
- **Error**：副状态显示 `ERROR`；主体显示简短的 `error.message`，不要堆栈。
- **Empty**：无数据时不显示 `0` 或空壳，而是文字提示"点击齿轮添加…"等下一步引导。

### 2.3 交互层级与事件冒泡

- 磁贴内**所有交互控件**（按钮、输入框、超链接）必须 `e.stopPropagation()`，或直接用原生 `<button>/<a>/<input>/<textarea>/<select>` —— NavView 的点击分发会自动排除这些原生标签，防止误触发"展开"。
- 自定义 `<div onClick>` / `<span onClick>` 写法请务必 `e.stopPropagation()`（也可加 `data-nobubble` 属性走自动排除通道）。
- 展开提示 `⤢` 仅作视觉提示，`opacity: 0` → `hover` 时浮现，不承担点击职责。
- 右键菜单由 Shell 的 `onCtxTile` 统一处理，包含"编辑（齿轮）"、"调整大小"、"删除"等。

### 2.4 数据刷新节奏

使用 `useWidgetData` 时，`refreshMs` 按数据新鲜度挑选：
- 天气：30 分钟
- 热搜：5 分钟
- 一言：仅用户主动刷新（不自动轮询）
- 汇率等（未来）：1 小时
- 时间类（时钟、倒计时、年进度）：1 秒 / 1 分钟本地 `setInterval`
- 禁止 < 30 秒轮询，除非业务强制。

### 2.5 外部 API 调用约定

- 优先走**后端代理**（`/api/widgets/*`），统一添加 Redis 缓存、隐藏 API key。
- 仅"官方支持 CORS 且无敏感 key"的接口允许浏览器直连（如 `hitokoto.cn`）。
- 后端代理必须 Redis 缓存，TTL 与刷新节奏挂钩（刷新 5 分钟 → 缓存 ≥ 5 分钟）。

### 2.6 尺寸与排版

- 默认 `span: 1`（正方形），内容密集型（热搜、音乐、一言）可 `span: 2`。
- `widget-big` 数字类（计时器、温度）用 `font-variant-numeric: tabular-nums` 保证等宽跳变。
- 详情 Modal 不用 `widget` 外层 class，改用 `wcc-backdrop` + `glass-strong`，与编辑 Modal 风格一致。

### 2.7 游客（未登录）模式

- `useWidgetConfig` 自动跳过持久化请求，无 401。
- `useWidgetData` 如命中 401（部分需要登录的接口），应捕获错误并显示"登录后可用"。
- 不得因游客状态报红或卡死。

### 2.8 可访问性

- 按钮必须是 `<button>`（不是 `<div onClick>`），带 `title` 或 `aria-label`。
- 展开 Modal 支持 `Esc` 关闭；焦点在打开时进入 Modal 内。
- 色彩对比度 ≥ 4.5:1，状态不仅用颜色区分（还应有文字/图标）。

### 2.9 可编辑（gear）与可展开（maximize）的选择

| 能力 | 字段 | 触发 |
|-----|-----|-----|
| 改 config | `editable: true` | 右键菜单"编辑" → `WidgetEditModal` |
| 看详情 | `renderDetail: (w) => ReactNode` | 磁贴右上角 `⤢` → `WidgetDetailModal` |

两个字段相互独立：
- 时钟：`renderDetail` 有、`editable` 无。
- 番茄钟：都有（可改时长、可看本日轮次统计）。
- 计算器：都无。

---

## 3、注册约定

`frontend/src/widgets/index.tsx` 每个条目：

```ts
{
  id: "foo",
  icon: "star",
  name: "示例",
  description: "给用户看到的一句话介绍，≤ 40 字。",
  span: 1,                       // 1 | 2
  editable?: boolean,            // 有无齿轮编辑
  render: (w) => <FooWidget w={w} />,
  renderDetail?: (w) => <FooDetail w={w} />,
}
```

同时在 `DEMO_CONFIG` 里给目录预览提供一份代表性配置。

---

## 4、新增小组件清单（Checklist）

开发任何新小组件前对照这份清单，全部打勾再提交：

- [ ] 使用 `.widget` + `.widget-header` 骨架
- [ ] 至少一种磁贴内交互，或者有 `renderDetail`
- [ ] 用 `useWidgetConfig` 持久化配置（如无配置可跳过）
- [ ] 使用 `useWidgetData`（远端数据）或本地 `setInterval`（时间类）
- [ ] 处理 Loading / Error / Empty 三态
- [ ] 交互控件 `e.stopPropagation()`
- [ ] 登录用户与游客都不报错
- [ ] 注册到 `WIDGET_REGISTRY`，并填 `DEMO_CONFIG`（未注册 = 添加弹窗看不到）
- [ ] `name` / `description` 包含用户搜索可能输入的关键词（中文 + 同义词）
- [ ] 在 `WidgetCatalogModal` 的搜索框输入关键词能命中该 widget
- [ ] 若 `editable`，在 `WidgetEditModal` 里加子表单
- [ ] 若 `renderDetail`，详情 Modal 与磁贴信息层级有区分（详情 > 磁贴）
- [ ] `npx tsc --noEmit` & `npx vite build` 通过

---

## 5、参考实现

- 最小可交互示例：`widgets/HitokotoWidget.tsx`
- 可编辑 + 数据拉取：`widgets/WeatherWidget.tsx`
- 可编辑 + 持久状态：`widgets/TodoWidget.tsx`
- 纯展示 + 本地计时：`widgets/YearProgressWidget.tsx`
- 可展开详情：`widgets/PomodoroWidget.tsx` (参见 `renderDetail`)

---
- 上一篇：[04-frontend/02-migration.md](../04-frontend/02-migration.md)
- 下一篇：[06-grid/01-overview.md](../06-grid/01-overview.md)
- 返回索引：[docs/README.md](../../README.md)# 小组件设计规范

NavHub 的小组件（widget）承担"随手可查、随手可改"的轻量面板职责。本文定义所有内置与后续新增小组件必须满足的设计与实现规范，确保体验一致、易用、可扩展。

## 三条基本原则（用户强制要求）

### 1. 可交互
小组件不是单纯的信息橱窗。每个小组件在自身磁贴内至少提供一种用户可直接操作的能力：
- 输入/写入：如待办、便签。
- 控制/状态切换：如音乐播放、番茄钟启停。
- 数据切换：如热搜切换来源、一言换一句。
- 链接跳转：如热搜条目跳到原站。
- 无控制型小组件（时钟、年进度）至少在点击时有反馈（打开详情）。

### 2. 点击展开详情
小组件磁贴本身即为可点击区域——鼠标点击磁贴任意空白处即打开详情 Modal：
- 在注册表提供 `renderDetail`，Shell/NavView 会自动给该磁贴加上 `.expandable` 样式与 `onClick` 处理器；右上角 hover 显示 `⤢` 小提示图标纯作视觉提示。
- 弹出**居中 Modal**，背后遮罩；点击遮罩或 `Esc` 关闭。
- 展示"更多详情"：比磁贴更大、更完整的数据视图，信息密度更高、可编辑能力更强。
- Modal 宽度建议 `min(720px, 90vw)`，高度自适应不超过 `80vh`，内部可滚动。
- **内部交互控件（按钮、输入框、超链接、可编辑区域）必须 `e.stopPropagation()` 或使用原生 `<button>/<a>/<input>/<textarea>`**，否则点击会穿透触发展开。NavView 对常见原生标签已做自动排除；非原生的 `<div onClick>` 务必 `stopPropagation`。
- 若小组件"本身即是完整交互"（计算器、嵌入网页），不要提供 `renderDetail` —— 无 `renderDetail` 的磁贴不会点击展开，右键/内部交互仍正常。

### 3. 用户配置持久化
任何用户可修改的状态都必须通过 `useWidgetConfig` 写入 `widgets.config` JSONB 字段：
- 本地即时更新 + 600ms 防抖持久化。
- 登录用户：写入数据库，跨设备/跨刷新保留。
- 游客用户：纯内存，页面刷新丢失（且不触发 401）。
- 不得把用户数据放在 `useState`/`localStorage` 里绕过统一持久化。

### 4. 必须注册到小组件目录（可添加、可搜索）
每个小组件必须在 `frontend/src/widgets/index.tsx` 的 `WIDGET_REGISTRY` 注册，否则"添加小组件"弹窗里不会出现，用户无法使用：

- 必填 `id`（英文小写，短横线分隔）、`name`（中文短名）、`description`（≤ 40 字的一句话介绍）、`icon`（Lucide 图标名）、`span`（1 或 2）、`render`。
- 名称与描述同时作为**搜索关键字**：用户在 `WidgetCatalogModal` 搜索框输入时会匹配 `name` 和 `description`（命中任一即展示）。因此描述里要自然覆盖用户可能用的关键词（如番茄钟描述里带"计时器"、"专注"等）。
- 在 `DEMO_CONFIG` 提供一份代表性的默认配置，目录里缩略预览更真实。
- 新组件增加后，在本文的"新增小组件清单"里打勾确认注册与搜索命中。

---

## 扩展规范（基于原则衍生）

### 5. 统一结构
每个小组件必须使用标准外层骨架：

```tsx
<div className="widget w-<kind>">
  <div className="widget-header">
    <span className="widget-title">{主标题}</span>
    <span className="muted mono" style={{ fontSize: 10 }}>{副状态}</span>
  </div>
  {主体内容}
</div>
```

- `widget-title` 短、明确，支持动态（如"热搜 · 微博"）。
- 副状态只显示一类信息：状态标签（`LOADING` / `UPDATED` / `ERROR`）或计数（`12/20`、`DAY 158`）。

### 6. 加载 / 错误 / 空三态
异步加载的小组件必须分别处理：
- **Loading**：副状态显示 `LOADING`；主体区展示骨架或灰色占位（不要空白）。
- **Error**：副状态显示 `ERROR`；主体显示简短的 `error.message`，不要堆栈。
- **Empty**：无数据时不显示 `0` 或空壳，而是文字提示"点击齿轮添加…"等下一步引导。

### 7. 交互层级与事件冒泡
- 磁贴内**所有交互控件**（按钮、输入框、超链接）必须 `e.stopPropagation()`，或直接用原生 `<button>/<a>/<input>/<textarea>/<select>` —— NavView 的点击分发会自动排除这些原生标签，防止误触发"展开"。
- 自定义 `<div onClick>` / `<span onClick>` 写法请务必 `e.stopPropagation()`（也可加 `data-nobubble` 属性走自动排除通道）。
- 展开提示 `⤢` 仅作视觉提示，`opacity: 0` → `hover` 时浮现，不承担点击职责。
- 右键菜单由 Shell 的 `onCtxTile` 统一处理，包含"编辑（齿轮）"、"调整大小"、"删除"等。

### 8. 数据刷新节奏
使用 `useWidgetData` 时，`refreshMs` 按数据新鲜度挑选：
- 天气：30 分钟
- 热搜：5 分钟
- 一言：仅用户主动刷新（不自动轮询）
- 汇率等（未来）：1 小时
- 时间类（时钟、倒计时、年进度）：1 秒 / 1 分钟本地 `setInterval`
- 禁止 < 30 秒轮询，除非业务强制。

### 9. 外部 API 调用约定
- 优先走**后端代理**（`/api/widgets/*`），统一添加 Redis 缓存、隐藏 API key。
- 仅"官方支持 CORS 且无敏感 key"的接口允许浏览器直连（如 `hitokoto.cn`）。
- 后端代理必须 Redis 缓存，TTL 与刷新节奏挂钩（刷新 5 分钟 → 缓存 ≥ 5 分钟）。

### 10. 尺寸与排版
- 默认 `span: 1`（正方形），内容密集型（热搜、音乐、一言）可 `span: 2`。
- `widget-big` 数字类（计时器、温度）用 `font-variant-numeric: tabular-nums` 保证等宽跳变。
- 详情 Modal 不用 `widget` 外层 class，改用 `wcc-backdrop` + `glass-strong`，与编辑 Modal 风格一致。

### 11. 游客（未登录）模式
- `useWidgetConfig` 自动跳过持久化请求，无 401。
- `useWidgetData` 如命中 401（部分需要登录的接口），应捕获错误并显示"登录后可用"。
- 不得因游客状态报红或卡死。

### 12. 可访问性
- 按钮必须是 `<button>`（不是 `<div onClick>`），带 `title` 或 `aria-label`。
- 展开 Modal 支持 `Esc` 关闭；焦点在打开时进入 Modal 内。
- 色彩对比度 ≥ 4.5:1，状态不仅用颜色区分（还应有文字/图标）。

### 13. 可编辑（gear）与可展开（maximize）的选择
| 能力 | 字段 | 触发 |
|-----|-----|-----|
| 改 config | `editable: true` | 右键菜单"编辑" → `WidgetEditModal` |
| 看详情 | `renderDetail: (w) => ReactNode` | 磁贴右上角 `⤢` → `WidgetDetailModal` |

两个字段相互独立：
- 时钟：`renderDetail` 有、`editable` 无。
- 番茄钟：都有（可改时长、可看本日轮次统计）。
- 计算器：都无。

---

## 注册约定

`frontend/src/widgets/index.tsx` 每个条目：

```ts
{
  id: "foo",
  icon: "star",
  name: "示例",
  description: "给用户看到的一句话介绍，≤ 40 字。",
  span: 1,                       // 1 | 2
  editable?: boolean,            // 有无齿轮编辑
  render: (w) => <FooWidget w={w} />,
  renderDetail?: (w) => <FooDetail w={w} />,
}
```

同时在 `DEMO_CONFIG` 里给目录预览提供一份代表性配置。

---

## 新增小组件清单（Checklist）

开发任何新小组件前对照这份清单，全部打勾再提交：

- [ ] 使用 `.widget` + `.widget-header` 骨架
- [ ] 至少一种磁贴内交互，或者有 `renderDetail`
- [ ] 用 `useWidgetConfig` 持久化配置（如无配置可跳过）
- [ ] 使用 `useWidgetData`（远端数据）或本地 `setInterval`（时间类）
- [ ] 处理 Loading / Error / Empty 三态
- [ ] 交互控件 `e.stopPropagation()`
- [ ] 登录用户与游客都不报错
- [ ] 注册到 `WIDGET_REGISTRY`，并填 `DEMO_CONFIG`（未注册 = 添加弹窗看不到）
- [ ] `name` / `description` 包含用户搜索可能输入的关键词（中文 + 同义词）
- [ ] 在 `WidgetCatalogModal` 的搜索框输入关键词能命中该 widget
- [ ] 若 `editable`，在 `WidgetEditModal` 里加子表单
- [ ] 若 `renderDetail`，详情 Modal 与磁贴信息层级有区分（详情 > 磁贴）
- [ ] `npx tsc --noEmit` & `npx vite build` 通过

---

## 参考实现

- 最小可交互示例：`widgets/HitokotoWidget.tsx`
- 可编辑 + 数据拉取：`widgets/WeatherWidget.tsx`
- 可编辑 + 持久状态：`widgets/TodoWidget.tsx`
- 纯展示 + 本地计时：`widgets/YearProgressWidget.tsx`
- 可展开详情：`widgets/PomodoroWidget.tsx` (参见 `renderDetail`)
