/** SSO 静默续期（Outline 式）：应用会话过期但 IdP 会话仍在时，用 prompt=none 自动重登。 */

export const SSO_HINT_KEY = "navhub_sso_hint";
export const SSO_SILENT_LOCK_KEY = "navhub_sso_silent_inflight";
export const SSO_INTERACTIVE_PARAM = "nh_sso";

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

export function clearSilentLock(): void {
  try {
    window.sessionStorage.removeItem(SSO_SILENT_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function isSilentLocked(): boolean {
  try {
    return window.sessionStorage.getItem(SSO_SILENT_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 从回调落地 URL 消费 `nh_sso=interactive`（IdP 无会话，静默失败）。
 * 返回 true 表示本次不得再自动 prompt=none，以免死循环。
 */
export function consumeSilentFailure(href?: string): boolean {
  if (typeof window === "undefined" && !href) return false;
  try {
    const u = new URL(href ?? window.location.href, "http://localhost");
    if (u.searchParams.get(SSO_INTERACTIVE_PARAM) !== "interactive") {
      return false;
    }
    u.searchParams.delete(SSO_INTERACTIVE_PARAM);
    const next = u.pathname + u.search + u.hash;
    if (typeof window !== "undefined" && !href) {
      window.history.replaceState({}, "", next || "/");
      clearSilentLock();
    }
    return true;
  } catch {
    return false;
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
    window.sessionStorage.setItem(SSO_SILENT_LOCK_KEY, "1");
  } catch {
    /* ignore */
  }
  window.location.assign(buildLoginUrl({ silent: true, returnTo }));
  return true;
}

/** API 401：若有 SSO hint 则静默续期（不堆叠重试）。 */
export function maybeSilentReauthOn401(): void {
  if (typeof window === "undefined") return;
  if (!hasSsoHint()) return;
  if (isSilentLocked()) return;
  beginSilentReauth();
}
