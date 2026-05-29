import { describe, it, expect } from "vitest";
import { safeLinkHref } from "./markdownSanitize";

// sanitizeRenderedLinks / linkSanitizerPlugin 依赖真实 DOM,项目未安装
// jsdom/happy-dom 测试环境,故 DOM 遍历部分经 build + 推理验证;
// 这里覆盖可纯函数化的 URL 判定内核(委托项目统一的 safeHttpUrl)。

describe("safeLinkHref", () => {
  it("放行 http/https 链接", () => {
    expect(safeLinkHref("https://example.com")).toBe("https://example.com/");
    expect(safeLinkHref("http://a.com/p")).toBe("http://a.com/p");
  });

  it("拦截 javascript: / data: / vbscript: 伪协议(返回 null)", () => {
    expect(safeLinkHref("javascript:alert(1)")).toBeNull();
    expect(safeLinkHref("data:text/html,<script>")).toBeNull();
    expect(safeLinkHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("空值返回 null", () => {
    expect(safeLinkHref(null)).toBeNull();
    expect(safeLinkHref(undefined)).toBeNull();
    expect(safeLinkHref("")).toBeNull();
  });
});
