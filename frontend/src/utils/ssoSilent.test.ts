import { afterEach, describe, expect, it } from "vitest";
import {
  SSO_HINT_KEY,
  SSO_INTERACTIVE_PARAM,
  SSO_SILENT_LOCK_KEY,
  buildLoginUrl,
  consumeSilentFailure,
  sanitizeReturnTo,
  shouldAttemptSilentReauth,
} from "./ssoSilent";

describe("sanitizeReturnTo", () => {
  it("缺省回首页", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
    expect(sanitizeReturnTo("   ")).toBe("/");
  });

  it("接受站内相对路径", () => {
    expect(sanitizeReturnTo("/")).toBe("/");
    expect(sanitizeReturnTo("/admin?tab=sso")).toBe("/admin?tab=sso");
    expect(sanitizeReturnTo("/#grp")).toBe("/#grp");
  });

  it("拒绝 open redirect", () => {
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeReturnTo("/\\evil")).toBe("/");
    expect(sanitizeReturnTo("/foo://bar")).toBe("/");
  });
});

describe("buildLoginUrl", () => {
  it("交互登录带 return_to", () => {
    expect(buildLoginUrl({ returnTo: "/admin" })).toBe(
      "/auth/login?return_to=%2Fadmin",
    );
  });

  it("静默登录带 prompt=none", () => {
    expect(buildLoginUrl({ silent: true, returnTo: "/" })).toBe(
      "/auth/login?prompt=none&return_to=%2F",
    );
  });
});

describe("consumeSilentFailure", () => {
  it("识别 nh_sso=interactive", () => {
    expect(
      consumeSilentFailure("http://localhost:8088/?nh_sso=interactive"),
    ).toBe(true);
  });

  it("普通落地不算失败", () => {
    expect(consumeSilentFailure("http://localhost:8088/")).toBe(false);
  });
});

describe("shouldAttemptSilentReauth", () => {
  afterEach(() => {
    window.localStorage.removeItem(SSO_HINT_KEY);
    window.sessionStorage.removeItem(SSO_SILENT_LOCK_KEY);
  });

  it("无 hint 不静默（访客）", () => {
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: true, silentFailed: false }),
    ).toBe(false);
  });

  it("有 hint 且 SSO 开启则静默", () => {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: true, silentFailed: false }),
    ).toBe(true);
  });

  it("静默已失败则不再自动跳", () => {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: true, silentFailed: true }),
    ).toBe(false);
  });

  it("SSO 关闭不静默", () => {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: false, silentFailed: false }),
    ).toBe(false);
  });

  it("进行中的静默不堆叠", () => {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
    window.sessionStorage.setItem(SSO_SILENT_LOCK_KEY, "1");
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: true, silentFailed: false }),
    ).toBe(false);
  });

  it("consume 参数名保持 nh_sso", () => {
    expect(SSO_INTERACTIVE_PARAM).toBe("nh_sso");
  });
});
