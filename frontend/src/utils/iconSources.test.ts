import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./iconSources";

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
