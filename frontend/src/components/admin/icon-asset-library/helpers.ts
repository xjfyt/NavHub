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

/**
 * 已缓存远端图标的展示 src：优先用本地 storageKey（/uploads/…），
 * 否则退回原始 originalUrl。
 */
export const remoteIconSrc = (w: {
  storageKey: string | null;
  originalUrl: string;
}): string => (w.storageKey ? `/uploads/${w.storageKey}` : w.originalUrl);

/**
 * 从上传响应推断入库用的 storageKey：
 * 优先用接口返回的 filename；否则从 url 中解析 /uploads/ 之后的文件名；
 * 都拿不到则返回空串。
 */
export const storageKeyFromUpload = (res: {
  filename?: string | null;
  url: string;
}): string =>
  res.filename ?? res.url.split("?")[0].split("/uploads/").pop() ?? "";

/** 去掉文件名的扩展名，作为手动上传图标的默认标题。 */
export const titleFromFileName = (fileName: string): string =>
  fileName.replace(/\.[^/.]+$/, "");
