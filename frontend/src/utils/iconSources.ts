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

/**
 * A11Y-1: 把「站点 URL + 是否新标签页打开」决策成一个真实 <a> 的属性集合。
 *
 * 站点磁贴改用原生 <a href> 渲染后,中键 / Ctrl/Cmd-点击 / 右键复制链接等浏览器原生
 * 行为即自动可用,无需 JS 重写。href 必须经 SEC-9 的 safeHttpUrl 过滤:
 *   - 合法 http/https      → { href, (target/rel) }
 *   - javascript:/data: 等 → null(调用方据此渲染为非跳转的禁用态,绝不输出不安全 href)
 *   - 空 / null / "#" 占位  → null
 *
 * newTab 缺省为 true,以保持改造前「始终新标签页打开」的默认行为;传 false(对应
 * iconOpen="current" 偏好)时同标签页打开,不带 target / rel。
 */
export function resolveSiteLink(
  url?: string | null,
  opts?: { newTab?: boolean },
): { href: string; target?: string; rel?: string } | null {
  if (!url || url === "#") return null;
  const href = safeHttpUrl(url);
  if (!href) return null;
  const newTab = opts?.newTab ?? true;
  return newTab
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : { href };
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
