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
