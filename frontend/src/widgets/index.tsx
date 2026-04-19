import React from "react";
import type { WidgetView } from "../types";
import { ClockWidget, ClockDetail } from "./ClockWidget";
import { WeatherWidget, WeatherDetail } from "./WeatherWidget";
import { CountdownWidget, CountdownDetail } from "./CountdownWidget";
import { TodoWidget, TodoDetail } from "./TodoWidget";
import { NotesWidget, NotesDetail } from "./NotesWidget";
import { CalendarWidget, CalendarDetail } from "./CalendarWidget";
import { RssWidget, RssDetail } from "./RssWidget";
import { MusicWidget, MusicDetail } from "./MusicWidget";
import { CalculatorWidget } from "./CalculatorWidget";
import { IframeWidget } from "./IframeWidget";
import { PomodoroWidget, PomodoroDetail } from "./PomodoroWidget";
import { YearProgressWidget, YearProgressDetail } from "./YearProgressWidget";
import { HitokotoWidget, HitokotoDetail } from "./HitokotoWidget";
import { MarkdownWidget, MarkdownDetail } from "./MarkdownWidget";
import { SearchWidget } from "./SearchWidget";

export { ClockWidget } from "./ClockWidget";
export { WeatherWidget } from "./WeatherWidget";
export { CountdownWidget } from "./CountdownWidget";
export { TodoWidget } from "./TodoWidget";
export { NotesWidget } from "./NotesWidget";
export { CalendarWidget } from "./CalendarWidget";
export { RssWidget } from "./RssWidget";
export { MusicWidget } from "./MusicWidget";
export { CalculatorWidget } from "./CalculatorWidget";
export { IframeWidget } from "./IframeWidget";
export { PomodoroWidget } from "./PomodoroWidget";
export { YearProgressWidget } from "./YearProgressWidget";
export { HitokotoWidget } from "./HitokotoWidget";
export { MarkdownWidget } from "./MarkdownWidget";
export { SearchWidget } from "./SearchWidget";

export interface WidgetTypeInfo {
  id: string;
  name: string;
  description: string;
  icon?: string;
  span: number;
  row?: number;
  render: (w?: WidgetView) => React.ReactNode;
  /** 是否支持通过 WidgetEditModal 编辑（齿轮按钮是否显示） */
  editable?: boolean;
  /**
   * 展开详情视图。若提供，磁贴右上角显示 ⤢ 按钮，点击后在 WidgetDetailModal 中显示。
   * 若不提供，则不显示展开按钮（适合本身即为完整交互的组件，如计算器、嵌入网页）。
   */
  renderDetail?: (w?: WidgetView) => React.ReactNode;
  /** 详情 Modal 的宽度/高度覆盖；默认 720px/80vh。 */
  detailWidth?: string;
  detailMaxHeight?: string;
}

export const WIDGET_REGISTRY: Record<string, WidgetTypeInfo> = {
  clock: {
    id: "clock",
    icon: "clock",
    name: "时钟",
    description: "世界时钟与本地问候，时刻保持时间敏感度。",
    span: 1,
    row: 1,
    render: (w) => <ClockWidget w={w} />,
    renderDetail: (w) => <ClockDetail w={w} />,
  },
  weather: {
    id: "weather",
    icon: "cloud",
    name: "天气",
    description: "24小时预报、未来7天预报、城市查询，随时关注天气变化状况。",
    span: 2,
    row: 2,
    editable: true,
    render: (w) => <WeatherWidget w={w} />,
    renderDetail: (w) => <WeatherDetail w={w} />,
  },
  countdown: {
    id: "countdown",
    icon: "calendar",
    name: "倒计时",
    description: "重要日子倒计时记录，如纪念日、高考、下班等。",
    span: 2,
    row: 1,
    editable: true,
    render: (w) => <CountdownWidget w={w} />,
    renderDetail: (w) => <CountdownDetail w={w} />,
  },
  todo: {
    id: "todo",
    icon: "check-square",
    name: "待办",
    description: "通过待办事项来列出需要处理的事物，包括生活、工作或其它事项。",
    span: 2,
    row: 2,
    render: (w) => <TodoWidget w={w} />,
    renderDetail: (w) => <TodoDetail w={w} />,
  },
  notes: {
    id: "notes",
    icon: "edit",
    name: "便签",
    description: "极简便笺，随时随地记录灵感与思路。",
    span: 2,
    row: 2,
    render: (w) => <NotesWidget w={w} />,
    renderDetail: (w) => <NotesDetail w={w} />,
  },
  calendar: {
    id: "calendar",
    icon: "calendar",
    name: "日历",
    description: "使用日历来跟踪倒数日、节假日、法定节假日、纪念日，不错过每一个重要的日子。",
    span: 2,
    row: 2,
    render: (w) => <CalendarWidget w={w} />,
    renderDetail: (w) => <CalendarDetail w={w} />,
  },
  rss: {
    id: "rss",
    icon: "activity",
    name: "热搜",
    description: "热搜资讯，轻松获知全网动态。",
    span: 2,
    row: 2,
    editable: true,
    render: (w) => <RssWidget w={w} />,
    renderDetail: (w) => <RssDetail w={w} />,
  },
  music: {
    id: "music",
    icon: "music",
    name: "音乐",
    description: "沉浸式音乐播放器组件，极简美观。",
    span: 2,
    row: 2,
    editable: true,
    render: (w) => <MusicWidget w={w} />,
    renderDetail: (w) => <MusicDetail w={w} />,
  },
  calc: {
    id: "calc",
    icon: "hash",
    name: "计算器",
    description: "桌面快捷四则运算辅助，即用即走。",
    span: 2,
    row: 2,
    render: (w) => <CalculatorWidget w={w} />,
  },
  iframe: {
    id: "iframe",
    icon: "globe",
    name: "嵌入网页",
    description: "无缝嵌入其他网页面板或仪表盘。",
    span: 2,
    row: 2,
    editable: true,
    render: (w) => <IframeWidget w={w} />,
  },
  pomodoro: {
    id: "pomodoro",
    icon: "clock",
    name: "番茄钟",
    description: "经典番茄工作法计时器，专注 25 分钟、休息 5 分钟。",
    span: 1,
    row: 1,
    editable: true,
    render: (w) => <PomodoroWidget w={w} />,
    renderDetail: (w) => <PomodoroDetail w={w} />,
  },
  "year-progress": {
    id: "year-progress",
    icon: "activity",
    name: "年进度",
    description: "直观展示本年度已过进度，让时间感更具象。",
    span: 1,
    render: (w) => <YearProgressWidget w={w} />,
    renderDetail: (w) => <YearProgressDetail w={w} />,
  },
  hitokoto: {
    id: "hitokoto",
    icon: "sparkle",
    name: "一言",
    description: "随机一句话，抚慰碎片时间；支持动漫 / 文学 / 诗词等多种来源。",
    span: 2,
    editable: true,
    render: (w) => <HitokotoWidget w={w} />,
    renderDetail: (w) => <HitokotoDetail w={w} />,
  },
  search: {
    id: "search",
    icon: "search",
    name: "搜索",
    description: "直接在磁贴里发起网页搜索，支持多引擎切换。search / google / baidu / bing。",
    span: 2,
    editable: true,
    render: (w) => <SearchWidget w={w} />,
  },
  markdown: {
    id: "markdown",
    icon: "edit",
    name: "Markdown 笔记",
    description: "多条笔记本，所见即所得编辑；支持颜色标记、搜索、表格、任务列表。笔记 / 文档 / note / Typora。",
    span: 2,
    detailWidth: "min(1100px, 94vw)",
    detailMaxHeight: "82vh",
    render: (w) => <MarkdownWidget w={w} />,
    renderDetail: (w) => <MarkdownDetail w={w} />,
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
