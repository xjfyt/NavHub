import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { safeHttpUrl } from "../utils/iconSources";

/**
 * FE-2: Milkdown 渲染输出的链接/图片安全过滤。
 *
 * 背景:Milkdown 的 commonmark `html` 节点把原始 HTML 当作 textContent 渲染
 * (不会执行),所以原始 HTML 不是 XSS 入口。真正的入口是 link / image 节点 ——
 * 它们的 toDOM 直接把 href / src 透传到 <a> / <img> 上,因此 `[x](javascript:…)`
 * 会渲染成可点击执行的 <a href="javascript:…">,构成存储型 XSS。
 *
 * 原代码对 markdown「源文本」做 DOMPurify.sanitize 既无效(源文本不是 HTML、
 * 还可能破坏合法 markdown),也拦不住上面的链接型注入。这里改为在渲染后的
 * 编辑器 DOM 上,用项目统一的 safeHttpUrl 过滤 href / src。
 */

/** 仅放行 http/https 的 href,否则返回 null(供调用方中和处理)。 */
export function safeLinkHref(value: string | null | undefined): string | null {
  return safeHttpUrl(value);
}

/** 就地清洗一个根元素下所有 <a href> / <img src>,移除危险协议。 */
export function sanitizeRenderedLinks(root: ParentNode): void {
  root.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href");
    const safe = safeLinkHref(href);
    if (safe === null) {
      // 危险协议(javascript:/data: 等):去掉跳转能力,但保留可见文本。
      el.removeAttribute("href");
    } else if (safe !== href) {
      el.setAttribute("href", safe);
    }
    // 防止 target=_blank 反向 tab 劫持。
    if (el.getAttribute("target") === "_blank") {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  root.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src");
    const safe = safeLinkHref(src);
    if (safe === null) {
      el.removeAttribute("src");
    } else if (safe !== src) {
      el.setAttribute("src", safe);
    }
  });
}

/**
 * ProseMirror 插件:首次渲染与每次更新后清洗编辑器 DOM 中的链接/图片。
 */
export function linkSanitizerPlugin(): Plugin {
  return new Plugin({
    view: (view: EditorView) => {
      sanitizeRenderedLinks(view.dom);
      return {
        update: (v: EditorView) => sanitizeRenderedLinks(v.dom),
      };
    },
  });
}
