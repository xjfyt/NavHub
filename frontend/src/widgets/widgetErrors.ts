export function isUnauthorizedError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const anyE = e as { status?: number; code?: string; message?: string };
  if (anyE.status === 401) return true;
  if (anyE.code === "unauthorized") return true;
  const m = (anyE.message || "").toLowerCase();
  return m === "unauthorized" || m.includes("unauthorized");
}

export function friendlyWidgetError(e: unknown, guest: boolean): string {
  if (isUnauthorizedError(e)) {
    return guest ? "登录后查看" : "暂无数据";
  }
  return "暂无数据";
}

/** 表单 / toast：有中文原文就用原文，英文错误码一律换成中文兜底。 */
export function friendlyUiError(e: unknown, fallback = "操作失败"): string {
  if (isUnauthorizedError(e)) return "登录已过期，请重新登录";
  const m =
    e instanceof Error
      ? e.message
      : e && typeof e === "object" && "message" in e
        ? String((e as { message?: unknown }).message ?? "")
        : "";
  if (/[\u4e00-\u9fff]/.test(m)) return m;
  return fallback;
}
