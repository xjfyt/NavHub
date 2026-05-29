import { describe, it, expect } from "vitest";
import { validateEngineInput, nextEngineId } from "./engineHelpers";

describe("validateEngineInput", () => {
  it("接受合法的名称 + 含 {q} 的 URL", () => {
    const r = validateEngineInput("GitHub", "https://github.com/search?q={q}");
    expect(r).toEqual({
      ok: true,
      value: { name: "GitHub", url: "https://github.com/search?q={q}" },
    });
  });

  it("去除名称与 URL 的首尾空白", () => {
    const r = validateEngineInput("  GitHub  ", "  https://x.com/?q={q}  ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("GitHub");
      expect(r.value.url).toBe("https://x.com/?q={q}");
    }
  });

  it("名称为空时报错", () => {
    const r = validateEngineInput("   ", "https://x.com/?q={q}");
    expect(r.ok).toBe(false);
  });

  it("URL 不含 {q} 时报错", () => {
    const r = validateEngineInput("X", "https://x.com/search");
    expect(r.ok).toBe(false);
  });

  it("名称为空且 URL 不含 {q} 时报错", () => {
    const r = validateEngineInput("", "nope");
    expect(r.ok).toBe(false);
  });

  // SEC: 自定义引擎 URL 的协议校验 —— 仅放行 http/https,拦截 javascript:/data: 等伪协议自 XSS。
  it("接受 http 协议的 URL", () => {
    const r = validateEngineInput("X", "http://x.com/search?q={q}");
    expect(r.ok).toBe(true);
  });

  it("接受缺省协议(无 scheme)的站点 URL", () => {
    const r = validateEngineInput("X", "x.com/s?q={q}");
    expect(r.ok).toBe(true);
  });

  it("拒绝 javascript: 协议", () => {
    const r = validateEngineInput("Evil", "javascript:alert(1)//{q}");
    expect(r.ok).toBe(false);
  });

  it("拒绝 data: 协议", () => {
    const r = validateEngineInput("Evil", "data:text/html,{q}");
    expect(r.ok).toBe(false);
  });

  it("拒绝大小写变体的伪协议(JavaScript:/JAVASCRIPT:)", () => {
    expect(validateEngineInput("E", "JavaScript:alert(1)//{q}").ok).toBe(false);
    expect(validateEngineInput("E", "JAVASCRIPT:alert(1)//{q}").ok).toBe(false);
    expect(validateEngineInput("E", "  javascript:alert(1)//{q}  ").ok).toBe(
      false,
    );
  });

  it("拒绝 vbscript: 协议", () => {
    const r = validateEngineInput("Evil", "vbscript:msgbox(1)//{q}");
    expect(r.ok).toBe(false);
  });
});

describe("nextEngineId", () => {
  const ids = ["google", "bing", "ddg"];

  it("循环到下一个引擎", () => {
    expect(nextEngineId(ids, "google")).toBe("bing");
    expect(nextEngineId(ids, "bing")).toBe("ddg");
  });

  it("到末尾回绕到第一个", () => {
    expect(nextEngineId(ids, "ddg")).toBe("google");
  });

  it("当前 id 不在列表里时回到第一个", () => {
    expect(nextEngineId(ids, "unknown")).toBe("google");
  });

  it("空列表返回当前 id(无可切换)", () => {
    expect(nextEngineId([], "google")).toBe("google");
  });

  it("单个引擎时保持不变", () => {
    expect(nextEngineId(["google"], "google")).toBe("google");
  });
});
