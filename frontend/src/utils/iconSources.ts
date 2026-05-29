export const BUILTIN_ICON_PREFIX = "builtin:";

export function buildBuiltinIconUrl(name: string): string {
  return `${BUILTIN_ICON_PREFIX}${name}`;
}

export function parseBuiltinIconUrl(value?: string | null): string | null {
  if (!value || !value.startsWith(BUILTIN_ICON_PREFIX)) return null;
  return value.slice(BUILTIN_ICON_PREFIX.length) || null;
}

export function normalizeSiteUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * SEC-9: 仅放行 http/https 的安全跳转地址。
 * 用户可控的图标/书签 URL 在 `window.open` / `location.href` / `<a href>` 之前必须经此过滤,
 * 否则 `javascript:`、`data:`、`vbscript:` 等伪协议会造成存储型 XSS。
 * 返回规范化后的安全 URL;不安全或无法解析时返回 null。
 */
export function safeHttpUrl(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  // 已带任意 scheme(含 javascript:)则原样解析、按 protocol 判定;否则视为缺省 https 的站点地址。
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function inferNameFromUrl(value: string): string {
  const normalized = normalizeSiteUrl(value);
  if (!normalized) return "";
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    const [first] = host.split(".");
    if (!first) return host;
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return "";
  }
}
