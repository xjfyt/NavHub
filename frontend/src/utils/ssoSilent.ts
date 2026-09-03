/** SSO 静默续期（Outline 式）：应用会话过期但 IdP 会话仍在时，用 prompt=none 自动重登。 */

import { applyCleanLocation, consumeSsoLanding } from "./ssoOrigin";

export const SSO_HINT_KEY = "navhub_sso_hint";
export const SSO_SILENT_LOCK_KEY = "navhub_sso_silent_inflight";
export const SSO_ENABLED_KEY = "navhub_sso_enabled";
export const SSO_INTERACTIVE_PARAM = "nh_sso";
/** Cross-tab lock TTL so several tabs hitting 401 don't stampede prompt=none. */
export const SSO_SILENT_LOCK_TTL_MS = 15_000;

/** 仅允许站内相对路径，防止 open redirect。 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  if (t.includes("\\") || t.includes("\n") || t.includes("\r") || t.includes("\0")) {
    return "/";
  }
  if (t.includes("://")) return "/";
  if (t.length > 512) return "/";
  return t;
}

export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/";
  return sanitizeReturnTo(
    window.location.pathname + window.location.search + window.location.hash,
  );
}

export function buildLoginUrl(opts?: {
  silent?: boolean;
  returnTo?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.silent) params.set("prompt", "none");
  params.set("return_to", sanitizeReturnTo(opts?.returnTo ?? currentReturnTo()));
  return `/auth/login?${params.toString()}`;
}

export function hasSsoHint(): boolean {
  try {
    return window.localStorage.getItem(SSO_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSsoHint(): void {
  try {
    window.localStorage.setItem(SSO_HINT_KEY, "1");
  } catch {
    /* quota */
  }
}

export function clearSsoHint(): void {
  try {
    window.localStorage.removeItem(SSO_HINT_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberSsoEnabled(enabled: boolean): void {
  try {
    window.sessionStorage.setItem(SSO_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readSsoEnabled(): boolean {
  try {
    return window.sessionStorage.getItem(SSO_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSilentLock(): void {
  try {
    window.localStorage.removeItem(SSO_SILENT_LOCK_KEY);
    window.sessionStorage.removeItem(SSO_SILENT_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function isSilentLocked(): boolean {
  try {
    const raw =
      window.localStorage.getItem(SSO_SILENT_LOCK_KEY) ??
      window.sessionStorage.getItem(SSO_SILENT_LOCK_KEY);
    if (!raw) return false;
    if (raw === "1") return true; // legacy session lock
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    if (Date.now() - ts > SSO_SILENT_LOCK_TTL_MS) {
      window.localStorage.removeItem(SSO_SILENT_LOCK_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 从回调落地 URL 消费 `nh_sso=interactive`（IdP 无会话，静默失败）。
 * 返回 true 表示本次不得再自动 prompt=none，以免死循环。
 */
export function consumeSilentFailure(href?: string): boolean {
  return consumeSsoCallback(href).flag === "interactive";
}

export type SsoCallbackFlag = "interactive" | "error" | null;

/** 消费落地 URL 上的 nh_sso 标记，并清掉 code=/state= 等 OAuth leftover。 */
export function consumeSsoCallback(href?: string): {
  flag: SsoCallbackFlag;
  strippedOauth: boolean;
} {
  if (typeof window === "undefined" && !href) {
    return { flag: null, strippedOauth: false };
  }
  try {
    const live = !href;
    const r = consumeSsoLanding(href ?? window.location.href);
    if (live && (r.flag || r.strippedOauth)) {
      applyCleanLocation(r.next);
      if (r.flag) clearSilentLock();
    }
    return { flag: r.flag, strippedOauth: r.strippedOauth };
  } catch {
    return { flag: null, strippedOauth: false };
  }
}

/**
 * 是否应尝试静默 SSO：SSO 已开启、本浏览器曾用 SSO 登录过、且未处于失败/进行中。
 */
export function shouldAttemptSilentReauth(input: {
  ssoEnabled: boolean;
  silentFailed: boolean;
}): boolean {
  if (!input.ssoEnabled) return false;
  if (input.silentFailed) return false;
  if (!hasSsoHint()) return false;
  if (isSilentLocked()) return false;
  return true;
}

/** 发起顶级跳转 prompt=none。成功开始返回 true。 */
export function beginSilentReauth(returnTo?: string): boolean {
  if (typeof window === "undefined") return false;
  if (isSilentLocked()) return false;
  try {
    window.localStorage.setItem(SSO_SILENT_LOCK_KEY, String(Date.now()));
  } catch {
    try {
      window.sessionStorage.setItem(SSO_SILENT_LOCK_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
  window.location.assign(buildLoginUrl({ silent: true, returnTo }));
  return true;
}

/** 管理后台 overlay 内的 401 不得整页 prompt=none，否则会拆掉 overlay。 */
export function shouldSkipSilentReauthForPath(path: string | undefined): boolean {
  if (!path) return false;
  const p = path.split("?")[0];
  return p.startsWith("/api/admin") || p.includes("/api/admin/");
}

/** API 401：与 shouldAttemptSilentReauth 同一套门槛（含 ssoEnabled），避免关 SSO 时乱跳。 */
export function maybeSilentReauthOn401(
  ssoEnabled?: boolean,
  path?: string,
): void {
  if (typeof window === "undefined") return;
  if (shouldSkipSilentReauthForPath(path)) return;
  const enabled = ssoEnabled ?? readSsoEnabled();
  if (
    !shouldAttemptSilentReauth({
      ssoEnabled: enabled,
      silentFailed: false,
    })
  ) {
    return;
  }
  beginSilentReauth();
}
