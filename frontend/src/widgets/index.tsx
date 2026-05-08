import { lazy, Suspense } from "react";
import type { WidgetView } from "../types";
import { SearchWidget } from "./SearchWidget";

// Search lives on every page (floating bar) so it must NOT be lazy.
// Everything else only renders when the user has actually placed it on a
// dashboard, so we lazy-import per-component.

const ClockWidget = lazy(() => import("./ClockWidget").then((m) => ({ default: m.ClockWidget })));
const ClockDetail = lazy(() => import("./ClockWidget").then((m) => ({ default: m.ClockDetail })));
const WeatherWidget = lazy(() => import("./WeatherWidget").then((m) => ({ default: m.WeatherWidget })));
const WeatherDetail = lazy(() => import("./WeatherWidget").then((m) => ({ default: m.WeatherDetail })));
const CountdownWidget = lazy(() => import("./CountdownWidget").then((m) => ({ default: m.CountdownWidget })));
const CountdownDetail = lazy(() => import("./CountdownWidget").then((m) => ({ default: m.CountdownDetail })));
const TodoWidget = lazy(() => import("./TodoWidget").then((m) => ({ default: m.TodoWidget })));
const TodoDetail = lazy(() => import("./TodoWidget").then((m) => ({ default: m.TodoDetail })));
const NotesWidget = lazy(() => import("./NotesWidget").then((m) => ({ default: m.NotesWidget })));
const NotesDetail = lazy(() => import("./NotesWidget").then((m) => ({ default: m.NotesDetail })));
const CalendarWidget = lazy(() => import("./CalendarWidget").then((m) => ({ default: m.CalendarWidget })));
const CalendarDetail = lazy(() => import("./CalendarWidget").then((m) => ({ default: m.CalendarDetail })));
const RssWidget = lazy(() => import("./RssWidget").then((m) => ({ default: m.RssWidget })));
const RssDetail = lazy(() => import("./RssWidget").then((m) => ({ default: m.RssDetail })));
const MusicWidget = lazy(() => import("./MusicWidget").then((m) => ({ default: m.MusicWidget })));
const MusicDetail = lazy(() => import("./MusicWidget").then((m) => ({ default: m.MusicDetail })));
const CalculatorWidget = lazy(() => import("./CalculatorWidget").then((m) => ({ default: m.CalculatorWidget })));
const IframeWidget = lazy(() => import("./IframeWidget").then((m) => ({ default: m.IframeWidget })));
const PomodoroWidget = lazy(() => import("./PomodoroWidget").then((m) => ({ default: m.PomodoroWidget })));
const PomodoroDetail = lazy(() => import("./PomodoroWidget").then((m) => ({ default: m.PomodoroDetail })));
const YearProgressWidget = lazy(() => import("./YearProgressWidget").then((m) => ({ default: m.YearProgressWidget })));
const YearProgressDetail = lazy(() => import("./YearProgressWidget").then((m) => ({ default: m.YearProgressDetail })));
const HitokotoWidget = lazy(() => import("./HitokotoWidget").then((m) => ({ default: m.HitokotoWidget })));
const HitokotoDetail = lazy(() => import("./HitokotoWidget").then((m) => ({ default: m.HitokotoDetail })));
const MarkdownWidget = lazy(() => import("./MarkdownWidget").then((m) => ({ default: m.MarkdownWidget })));
const MarkdownDetail = lazy(() => import("./MarkdownWidget").then((m) => ({ default: m.MarkdownDetail })));

/** Wraps a widget tile so its chunk can stream in without crashing the dashboard. */
function tile(node: React.ReactNode) {
  return <Suspense fallback={<div className="widget-tile-fallback" aria-hidden />}>{node}</Suspense>;
}

/** Detail modals already render inside a modal shell; let it look loading. */
function detail(node: React.ReactNode) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-soft)" }}>加载中 …</div>
      }
    >
      {node}
    </Suspense>
  );
}

export { SearchWidget } from "./SearchWidget";

/**
 * 三档固定尺寸（参考 WebTab）：
 * - small  小  → 横向胶囊  (6×3 cells ≈ 224×104px)
 * - medium 中  → 方形      (6×6 cells ≈ 224×224px)
 * - large  大  → 横向长条  (12×5 cells ≈ 464×184px)
 */
export type WidgetSizeId = "small" | "medium" | "large";

export const WIDGET_SIZE_DIMENSIONS: Record<WidgetSizeId, { wSpan: number; wRow: number }> = {
  small: { wSpan: 6, wRow: 3 },
  medium: { wSpan: 6, wRow: 6 },
  large: { wSpan: 12, wRow: 5 },
};

export const WIDGET_SIZE_ORDER: WidgetSizeId[] = ["small", "medium", "large"];

export const WIDGET_SIZE_LABEL: Record<WidgetSizeId, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

/** 把任意存储的 wSpan/wRow 归约到三档之一（用于兼容旧数据） */
export function snapWidgetSize(wSpan?: number | null, wRow?: number | null): WidgetSizeId {
  const w = wSpan ?? 0;
  const r = wRow ?? 0;
  if (w <= 0 || r <= 0) return "medium";
  if (w === 6 && r === 3) return "small";
  if (w === 6 && r === 6) return "medium";
  if (w === 12 && r === 5) return "large";
  const area = w * r;
  const aspect = w / r;
  if (aspect >= 1.7) {
    return area >= 28 ? "large" : "small";
  }
  return area >= 12 ? "medium" : "small";
}

export function widgetDimensionsOf(key: WidgetSizeId) {
  return WIDGET_SIZE_DIMENSIONS[key];
}

export interface WidgetTypeInfo {
  id: string;
  name: string;
  description: string;
  icon?: string;
  /** @deprecated 旧字段，保留以兼容；新组件用 defaultSize */
  span?: number;
  /** @deprecated */
  row?: number;
  /** 默认尺寸；catalog 选择 + 新建时使用 */
  defaultSize?: WidgetSizeId;
  render: (w?: WidgetView) => React.ReactNode;
  /** 是否支持通过 WidgetEditModal 编辑（齿轮按钮是否显示） */
  editable?: boolean;
  /**
   * 展开详情视图。若提供，磁贴点击后在 WidgetDetailModal 中显示。
   * 若不提供，则不显示展开按钮（适合本身即为完整交互的组件，如计算器、嵌入网页）。
   */
  renderDetail?: (w?: WidgetView) => React.ReactNode;
  /** 详情 Modal 的宽度/高度覆盖；默认 720px/80vh。 */
  detailWidth?: string;
  detailMaxHeight?: string;
  /**
   * 全宽悬浮条模式：不渲染卡片外壳，横跨全部列，不可拖动。
   * 适合搜索框这类嵌入式工具组件。
   */
  floatingBar?: boolean;
}

export const WIDGET_REGISTRY: Record<string, WidgetTypeInfo> = {
  clock: {
    id: "clock",
    icon: "clock",
    name: "时钟",
    description: "世界时钟与本地问候，时刻保持时间敏感度。",
    defaultSize: "small",
    render: (w) => tile(<ClockWidget w={w} />),
    renderDetail: (w) => detail(<ClockDetail w={w} />),
  },
  weather: {
    id: "weather",
    icon: "cloud",
    name: "天气",
    description: "24小时预报、未来7天预报、城市查询，随时关注天气变化状况。",
    defaultSize: "large",
    editable: true,
    render: (w) => tile(<WeatherWidget w={w} />),
    renderDetail: (w) => detail(<WeatherDetail w={w} />),
  },
  countdown: {
    id: "countdown",
    icon: "calendar",
    name: "倒计时",
    description: "重要日子倒计时记录，如纪念日、高考、下班等。",
    defaultSize: "small",
    editable: true,
    render: (w) => tile(<CountdownWidget w={w} />),
    renderDetail: (w) => detail(<CountdownDetail w={w} />),
  },
  todo: {
    id: "todo",
    icon: "check-square",
    name: "待办",
    description: "通过待办事项来列出需要处理的事物，包括生活、工作或其它事项。",
    defaultSize: "medium",
    render: (w) => tile(<TodoWidget w={w} />),
    renderDetail: (w) => detail(<TodoDetail w={w} />),
  },
  notes: {
    id: "notes",
    icon: "edit",
    name: "便签",
    description: "极简便笺，随时随地记录灵感与思路。",
    defaultSize: "medium",
    render: (w) => tile(<NotesWidget w={w} />),
    renderDetail: (w) => detail(<NotesDetail w={w} />),
  },
  calendar: {
    id: "calendar",
    icon: "calendar",
    name: "日历",
    description: "使用日历来跟踪倒数日、节假日、法定节假日、纪念日，不错过每一个重要的日子。",
    defaultSize: "medium",
    render: (w) => tile(<CalendarWidget w={w} />),
    renderDetail: (w) => detail(<CalendarDetail w={w} />),
  },
  rss: {
    id: "rss",
    icon: "activity",
    name: "热搜",
    description: "热搜资讯，轻松获知全网动态。",
    defaultSize: "medium",
    editable: true,
    render: (w) => tile(<RssWidget w={w} />),
    renderDetail: (w) => detail(<RssDetail w={w} />),
  },
  music: {
    id: "music",
    icon: "music",
    name: "音乐",
    description: "沉浸式音乐播放器组件，极简美观。",
    defaultSize: "medium",
    editable: true,
    render: (w) => tile(<MusicWidget w={w} />),
    renderDetail: (w) => detail(<MusicDetail w={w} />),
  },
  calc: {
    id: "calc",
    icon: "hash",
    name: "计算器",
    description: "桌面快捷四则运算辅助，即用即走。",
    defaultSize: "medium",
    render: (w) => tile(<CalculatorWidget w={w} />),
  },
  iframe: {
    id: "iframe",
    icon: "globe",
    name: "嵌入网页",
    description: "无缝嵌入其他网页面板或仪表盘。",
    defaultSize: "large",
    editable: true,
    render: (w) => tile(<IframeWidget w={w} />),
  },
  pomodoro: {
    id: "pomodoro",
    icon: "clock",
    name: "番茄钟",
    description: "经典番茄工作法计时器，专注 25 分钟、休息 5 分钟。",
    defaultSize: "small",
    editable: true,
    render: (w) => tile(<PomodoroWidget w={w} />),
    renderDetail: (w) => detail(<PomodoroDetail w={w} />),
  },
  "year-progress": {
    id: "year-progress",
    icon: "activity",
    name: "年进度",
    description: "直观展示本年度已过进度，让时间感更具象。",
    defaultSize: "small",
    render: (w) => tile(<YearProgressWidget w={w} />),
    renderDetail: (w) => detail(<YearProgressDetail w={w} />),
  },
  hitokoto: {
    id: "hitokoto",
    icon: "sparkle",
    name: "一言",
    description: "随机一句话，抚慰碎片时间；支持动漫 / 文学 / 诗词等多种来源。",
    defaultSize: "medium",
    editable: true,
    render: (w) => tile(<HitokotoWidget w={w} />),
    renderDetail: (w) => detail(<HitokotoDetail w={w} />),
  },
  search: {
    id: "search",
    icon: "search",
    name: "搜索",
    description: "直接在磁贴里发起网页搜索，支持多引擎切换。search / google / baidu / bing。",
    defaultSize: "small",
    editable: true,
    floatingBar: true,
    render: (w) => <SearchWidget w={w} />,
  },
  markdown: {
    id: "markdown",
    icon: "edit",
    name: "Markdown 笔记",
    description: "多条笔记本，所见即所得编辑；支持颜色标记、搜索、表格、任务列表。笔记 / 文档 / note / Typora。",
    defaultSize: "medium",
    detailWidth: "min(1100px, 94vw)",
    detailMaxHeight: "82vh",
    render: (w) => tile(<MarkdownWidget w={w} />),
    renderDetail: (w) => detail(<MarkdownDetail w={w} />),
  },
};

export const WIDGET_KINDS = Object.values(WIDGET_REGISTRY);

/** 目录预览用的示例 config，让 preview 看起来真实 */
export const DEMO_CONFIG: Record<string, Record<string, unknown>> = {
  weather: { city: "北京" },
  countdown: {
    title: "与 Tina 相识",
    targetDate: "2020-05-20",
    mode: "up",
  },
  todo: {
    items: [
      { id: "d1", t: "Review PR #482", done: false },
      { id: "d2", t: "写周报", done: true },
      { id: "d3", t: "准备下午的 demo", done: false },
      { id: "d4", t: "预约牙医", done: false },
    ],
  },
  notes: { text: "本周目标\n · 发布 v1.2\n · 和设计同步图标方案\n · 整理账号权限" },
  rss: { source: "weibo" },
  music: {
    playlist: [
      { id: 0, title: "晴天", artist: "周杰伦", picUrl: "" },
    ],
  },
  iframe: { url: "https://example.com" },
  pomodoro: { workMin: 25, breakMin: 5 },
  hitokoto: { type: "" },
  search: { placeholder: "" },
  markdown: {
    notes: [
      {
        id: "n1",
        title: "本周目标",
        color: "#f59e0b",
        content: "# 本周目标\n\n- 发布 v1.2 版本\n- 和设计同步图标方案\n- 整理账号权限",
        updatedAt: Date.now() - 1000 * 60 * 60 * 2,
      },
      {
        id: "n2",
        title: "读书笔记",
        color: "#10b981",
        content: "# 深度工作\n\n专注力是这个时代最稀缺的资源，也是最有价值的技能之一。",
        updatedAt: Date.now() - 1000 * 60 * 60 * 24,
      },
      {
        id: "n3",
        title: "灵感收集",
        color: "#ef4444",
        content: "# 灵感\n\n把 notes widget 改造成带分类的卡片式，右侧预览。",
        updatedAt: Date.now() - 1000 * 60 * 60 * 48,
      },
    ],
    activeId: "n1",
  },
};
