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
