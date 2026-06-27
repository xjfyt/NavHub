# 二、设计令牌

> **对应代码**：`frontend/src/styles/`、`frontend/tailwind.config.js`
> **维护提示**：设计令牌变更时同步更新本文档。

## 1、概述

NavHub 使用 Tailwind CSS 作为样式框架，通过配置文件定义设计令牌。

## 2、颜色系统

### 2.1 主色调

```css
:root {
  --primary: #3b82f6;      /* 主色调 */
  --primary-dark: #2563eb;  /* 深色主色调 */
  --secondary: #6b7280;     /* 次要色 */
  --accent: #f59e0b;        /* 强调色 */
}
```

### 2.2 语义颜色

```css
:root {
  --success: #10b981;       /* 成功 */
  --warning: #f59e0b;       /* 警告 */
  --error: #ef4444;         /* 错误 */
  --info: #3b82f6;          /* 信息 */
}
```

## 3、间距系统

基于 4px 网格的间距系统：

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--space-1` | 4px | 最小间距 |
| `--space-2` | 8px | 小间距 |
| `--space-3` | 12px | 中等间距 |
| `--space-4` | 16px | 标准间距 |
| `--space-6` | 24px | 大间距 |
| `--space-8` | 32px | 超大间距 |

## 4、字体系统

### 4.1 字体族

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Fira Code', 'Consolas', monospace;
}
```

### 4.2 字体大小

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--text-xs` | 12px | 最小文本 |
| `--text-sm` | 14px | 小文本 |
| `--text-base` | 16px | 基础文本 |
| `--text-lg` | 18px | 大文本 |
| `--text-xl` | 20px | 超大文本 |

## 5、阴影系统

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}
```

## 6、圆角系统

```css
:root {
  --radius-sm: 4px;         /* 小圆角 */
  --radius: 6px;            /* 标准圆角 */
  --radius-md: 8px;         /* 中等圆角 */
  --radius-lg: 12px;        /* 大圆角 */
  --radius-full: 9999px;    /* 完全圆角 */
}
```

## 7、动画系统

### 7.1 过渡时间

```css
:root {
  --transition-fast: 150ms;
  --transition-normal: 300ms;
  --transition-slow: 500ms;
}
```

### 7.2 缓动函数

```css
:root {
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

## 8、使用方式

### 8.1 在 CSS 中使用

```css
.button {
  background-color: var(--primary);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius);
  transition: background-color var(--transition-fast) var(--ease-out);
}
```

### 8.2 在 Tailwind 中使用

```html
<button class="bg-primary text-white px-4 py-2 rounded transition-fast">
  点击按钮
</button>
```

---
- 上一篇：[01-config-file.md](./01-config-file.md)
- 下一篇：[03-i18n.md](./03-i18n.md)
- 返回索引：[docs/README.md](../README.md)