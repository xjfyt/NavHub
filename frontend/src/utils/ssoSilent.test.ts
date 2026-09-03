import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SSO_HINT_KEY,
  SSO_INTERACTIVE_PARAM,
  SSO_SILENT_LOCK_KEY,
  buildLoginUrl,
  consumeSilentFailure,
  maybeSilentReauthOn401,
  rememberSsoEnabled,
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
  const mem: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
  };
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { assign() {}, href: "http://localhost/" },
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
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
    window.localStorage.setItem(SSO_SILENT_LOCK_KEY, String(Date.now()));
    expect(
      shouldAttemptSilentReauth({ ssoEnabled: true, silentFailed: false }),
    ).toBe(false);
  });

  it("maybeSilentReauthOn401 在 SSO 关闭时不跳转", () => {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
    rememberSsoEnabled(false);
    const orig = window.location;
    maybeSilentReauthOn401();
    expect(window.localStorage.getItem(SSO_SILENT_LOCK_KEY)).toBeNull();
    void orig;
  });

  it("consume 参数名保持 nh_sso", () => {
    expect(SSO_INTERACTIVE_PARAM).toBe("nh_sso");
  });
});
