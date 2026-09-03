/** 127.0.0.1 与 localhost 对 Cookie 而言是不同站点，OIDC 必须先对齐 origin。 */

export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function hostOnly(hostPort: string): string {
  const h = hostPort.trim();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end > 0) return h.slice(1, end);
  }
  const idx = h.lastIndexOf(":");
  if (idx > 0 && !h.slice(idx + 1).includes(":")) return h.slice(0, idx);
  return h;
}

/** 若当前页与 SSO redirect origin 只是 loopback 别名不同，返回应对齐后的 origin。 */
export function canonicalOidcOrigin(
  currentOrigin: string,
  redirectOrigin: string | null | undefined,
): string | null {
  if (!redirectOrigin) return null;
  try {
    const cur = new URL(currentOrigin);
    const redir = new URL(redirectOrigin);
    const a = hostOnly(cur.hostname);
    const b = hostOnly(redir.hostname);
    if (a.toLowerCase() === b.toLowerCase()) return null;
    if (!isLoopbackHost(a) || !isLoopbackHost(b)) return null;
    return `${redir.protocol}//${redir.host}`;
  } catch {
    return null;
  }
}

const OAUTH_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "session_state",
]);

export type SsoLanding = "interactive" | "error" | null;

/** 清洗落地 URL：消费 nh_sso，去掉 code=，返回清洗后的 path+search+hash。 */
export function consumeSsoLanding(href: string): {
  flag: SsoLanding;
  next: string;
  strippedOauth: boolean;
} {
  const u = new URL(href, "http://localhost");
  const raw = u.searchParams.get("nh_sso");
  const flag: SsoLanding =
    raw === "error" ? "error" : raw === "interactive" ? "interactive" : null;
  if (flag) u.searchParams.delete("nh_sso");
  let strippedOauth = false;
  for (const k of [...u.searchParams.keys()]) {
    if (OAUTH_KEYS.has(k)) {
      u.searchParams.delete(k);
      strippedOauth = true;
    }
  }
  const q = u.searchParams.toString();
  const next = u.pathname + (q ? `?${q}` : "") + u.hash;
  return { flag, next: next || "/", strippedOauth };
}

export function applyCleanLocation(next: string): void {
  if (typeof window === "undefined") return;
  const cur =
    window.location.pathname + window.location.search + window.location.hash;
  if (cur === next) return;
  window.history.replaceState({}, "", next || "/");
}

export function safeAppTitle(appName: string | undefined | null): string {
  const n = (appName || "NavHub").trim() || "NavHub";
  return n.slice(0, 80);
}
