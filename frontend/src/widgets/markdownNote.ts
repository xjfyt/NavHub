// PERF-5: 笔记的纯派生逻辑(标题/预览/日期)从 MarkdownWidget 抽出,
// 既便于单测,也让磁贴与详情共享同一份实现。无 React 依赖。

export interface Note {
  id: string;
  title: string;
  color: string;
  content: string;
  updatedAt: number;
}

/** 从 markdown 正文派生标题:取首个非空行,去掉标题井号与行内符号,截断到 32 字。 */
export function deriveTitle(content: string, fallback = "未命名笔记"): string {
  const firstLine = content.split(/\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return fallback;
  return (
    firstLine
      .replace(/^#{1,6}\s+/, "")
      .replace(/[*_`>]/g, "")
      .trim()
      .slice(0, 32) || fallback
  );
}

/** 把 markdown 压成一行纯文本预览:剥离标题/强调/图片,链接只留文字,代码块占位。 */
export function plainPreview(content: string, limit = 80): string {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "「代码」")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, limit);
}

/** 相对友好的日期:今天显示时:分,今年显示「M月D日」,跨年显示完整日期。 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
