export function extractKeyFromUrl(url: string, param: string): string {
  try {
    return new URL(url).searchParams.get(param) ?? "";
  } catch {
    return "";
  }
}

export function stripKeyFromUrl(url: string, param: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete(param);
    return u.toString();
  } catch {
    return url;
  }
}

export function injectKeyIntoUrl(
  url: string,
  param: string,
  key: string,
): string {
  if (!key.trim()) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(param, key.trim());
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${param}=${encodeURIComponent(key.trim())}`;
  }
}

export const formatBytes = (n: number | null | undefined) => {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

export const formatDate = (iso: string | null) => {
  if (!iso) return "从未";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * 站点名称链接的 href：取来源 API 地址的 origin（protocol//hostname）；
 * 无法解析时退回原始字符串。
 */
export const siteOriginHref = (siteUrl: string): string => {
  try {
    const u = new URL(siteUrl);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return siteUrl;
  }
};
