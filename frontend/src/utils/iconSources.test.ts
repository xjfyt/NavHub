import { describe, it, expect } from "vitest";
import { safeHttpUrl, resolveSiteLink } from "./iconSources";

describe("safeHttpUrl", () => {
  it("接受 http/https 绝对地址", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com/");
    expect(safeHttpUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("为缺省 scheme 的站点补 https", () => {
    expect(safeHttpUrl("example.com")).toBe("https://example.com/");
  });

  it("拒绝 javascript: 伪协议(存储型 XSS)", () => {
    expect(safeHttpUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(safeHttpUrl("javascript://%0aalert(1)")).toBeNull();
    expect(safeHttpUrl("  JavaScript:alert(1)  ")).toBeNull();
  });

  it("拒绝 data: / vbscript: / file: 等危险协议", () => {
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("空值返回 null", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("resolveSiteLink (A11Y-1: 站点磁贴 → 真实 <a> 链接属性)", () => {
  it("合法 http/https → 返回规范化 href", () => {
    expect(resolveSiteLink("https://example.com", { newTab: true })?.href).toBe(
      "https://example.com/",
    );
    expect(resolveSiteLink("example.com", { newTab: true })?.href).toBe(
      "https://example.com/",
    );
  });

  it("新标签页 → target=_blank + rel=noopener noreferrer", () => {
    const link = resolveSiteLink("https://example.com", { newTab: true });
    expect(link).not.toBeNull();
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
  });

  it("当前标签页 → 不带 target,也不带 rel", () => {
    const link = resolveSiteLink("https://example.com", { newTab: false });
    expect(link).not.toBeNull();
    expect(link?.href).toBe("https://example.com/");
    expect(link?.target).toBeUndefined();
    expect(link?.rel).toBeUndefined();
  });

  it("默认未指定偏好时沿用「新标签页」(保持改造前行为)", () => {
    const link = resolveSiteLink("https://example.com");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
  });

  it("SEC-9: javascript: / data: / 危险协议 → null(渲染为禁用态,绝不输出不安全 href)", () => {
    expect(resolveSiteLink("javascript:alert(1)", { newTab: true })).toBeNull();
    expect(resolveSiteLink("data:text/html,<script>alert(1)</script>", { newTab: false })).toBeNull();
    expect(resolveSiteLink("vbscript:msgbox(1)")).toBeNull();
  });

  it("空 / null / # 占位 → null", () => {
    expect(resolveSiteLink("")).toBeNull();
    expect(resolveSiteLink("   ")).toBeNull();
    expect(resolveSiteLink(null)).toBeNull();
    expect(resolveSiteLink(undefined)).toBeNull();
    expect(resolveSiteLink("#")).toBeNull();
  });
});
