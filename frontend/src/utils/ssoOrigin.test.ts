import { describe, expect, it } from "vitest";
import {
  canonicalOidcOrigin,
  consumeSsoLanding,
  isLoopbackHost,
  safeAppTitle,
} from "./ssoOrigin";

describe("canonicalOidcOrigin", () => {
  it("127.0.0.1 → localhost", () => {
    expect(
      canonicalOidcOrigin("http://127.0.0.1:8088", "http://localhost:8088"),
    ).toBe("http://localhost:8088");
  });
  it("已对齐则不改", () => {
    expect(
      canonicalOidcOrigin("http://localhost:8088", "http://localhost:8088"),
    ).toBeNull();
  });
  it("非 loopback 不改", () => {
    expect(
      canonicalOidcOrigin("http://nav.example", "http://localhost:8088"),
    ).toBeNull();
  });
});

describe("consumeSsoLanding", () => {
  it("识别 error 并去掉 code=", () => {
    const r = consumeSsoLanding(
      "http://localhost:8088/?code=SECRET&state=ab&nh_sso=error",
    );
    expect(r.flag).toBe("error");
    expect(r.next).toBe("/");
    expect(r.strippedOauth).toBe(true);
    expect(r.next).not.toContain("code=");
  });
  it("识别 interactive", () => {
    expect(consumeSsoLanding("http://localhost:8088/?nh_sso=interactive").flag).toBe(
      "interactive",
    );
  });
  it("保留其它查询", () => {
    const r = consumeSsoLanding("http://localhost:8088/x?tab=sso&code=z");
    expect(r.next).toBe("/x?tab=sso");
  });
});

describe("misc", () => {
  it("loopback", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });
  it("title 不含查询串", () => {
    expect(safeAppTitle("NavHub")).toBe("NavHub");
    expect(safeAppTitle("")).toBe("NavHub");
  });
});
