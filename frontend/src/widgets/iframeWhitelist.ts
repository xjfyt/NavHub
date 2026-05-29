// WIDGET-10 纯逻辑:抽出 SEC-7 的 iframe 域名白名单判定,便于单测、避免回归。
//
// 安全约束(保持 SEC-7 不变):
// - 白名单为空 → 默认拒绝(绝不放行任意站点)。
// - 精确域名或其子域(host === allowed || host.endsWith("." + allowed))才放行,
//   不用 endsWith(allowed) 这种会被 evil-example.com 后缀绕过的判断。
// - 条目大小写不敏感、去掉前导点;空条目忽略。

export function isUrlAllowed(
  url: string | undefined | null,
  whitelist: string[] | undefined | null,
): boolean {
  if (!url) return false;
  const list = whitelist ?? [];
  if (list.length === 0) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  return list.some((entry) => {
    const allowed = entry.trim().toLowerCase().replace(/^\.+/, "");
    return !!allowed && (host === allowed || host.endsWith("." + allowed));
  });
}
