import { describe, it, expect } from "vitest";
import { isUrlAllowed } from "./iframeWhitelist";

describe("isUrlAllowed (SEC-7 白名单)", () => {
  it("白名单为空 → 默认拒绝(而非放行任意站点)", () => {
    expect(isUrlAllowed("https://example.com", [])).toBe(false);
  });

  it("精确域名命中", () => {
    expect(isUrlAllowed("https://example.com/path", ["example.com"])).toBe(true);
  });

  it("子域命中(.example.com)", () => {
    expect(isUrlAllowed("https://app.example.com", ["example.com"])).toBe(true);
    expect(isUrlAllowed("https://a.b.example.com", ["example.com"])).toBe(true);
  });

  it("后缀绕过被挡(evil-example.com 不应命中 example.com)", () => {
    expect(isUrlAllowed("https://evil-example.com", ["example.com"])).toBe(false);
    expect(isUrlAllowed("https://notexample.com", ["example.com"])).toBe(false);
  });

  it("大小写与前导点归一", () => {
    expect(isUrlAllowed("https://EXAMPLE.com", [".Example.com"])).toBe(true);
    expect(isUrlAllowed("https://x.example.com", [" example.com "])).toBe(true);
  });

  it("空条目被忽略,不会放行任意域", () => {
    expect(isUrlAllowed("https://example.com", ["", "  ", "."])).toBe(false);
  });

  it("非法/空 URL → 拒绝", () => {
    expect(isUrlAllowed("not a url", ["example.com"])).toBe(false);
    expect(isUrlAllowed(undefined, ["example.com"])).toBe(false);
    expect(isUrlAllowed("", ["example.com"])).toBe(false);
  });

  it("多条白名单任一命中即放行", () => {
    expect(isUrlAllowed("https://b.com", ["a.com", "b.com"])).toBe(true);
    expect(isUrlAllowed("https://c.com", ["a.com", "b.com"])).toBe(false);
  });
});
