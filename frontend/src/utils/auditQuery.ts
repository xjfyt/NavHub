// UX-6: 把审计日志的查询参数拼装抽成纯函数,便于单测,且与后端
// /api/admin/audit 的 clamp 行为对齐(limit 1..=500, offset >= 0)。

/** 审计日志的对象类型(kind)。与后端 util::audit 写入的取值一一对应。 */
export const AUDIT_KINDS: { id: string; label: string }[] = [
  { id: "group", label: "分组" },
  { id: "icon", label: "图标" },
  { id: "user", label: "用户" },
  { id: "widget", label: "小组件" },
  { id: "auth", label: "登录认证" },
  { id: "sso", label: "单点登录" },
  { id: "message", label: "系统消息" },
  { id: "settings", label: "系统设置" },
];

const VALID_KINDS = new Set(AUDIT_KINDS.map((k) => k.id));

export const DEFAULT_AUDIT_PAGE_SIZE = 50;

/** 后端 limit 上限,见 audit.rs 的 clamp(1, 500)。 */
export const AUDIT_MAX_LIMIT = 500;

export interface AuditFilterState {
  q: string;
  kind: string;
  page: number;
  pageSize: number;
}

export interface AuditParams {
  q?: string;
  kind?: string;
  limit: number;
  offset: number;
}

/**
 * 把 UI 的筛选状态转换为后端可识别的查询参数。
 * - 空白 q 视为未填(不下发)。
 * - 非法 kind 被忽略,避免下发后端不认识的过滤条件。
 * - pageSize 非法时回退到默认值,并夹到 [1, 500]。
 * - page 负值夹到 0,offset = page * pageSize。
 */
export function buildAuditParams(state: AuditFilterState): AuditParams {
  let limit = Math.floor(state.pageSize);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_AUDIT_PAGE_SIZE;
  if (limit > AUDIT_MAX_LIMIT) limit = AUDIT_MAX_LIMIT;

  const page = Number.isFinite(state.page)
    ? Math.max(0, Math.floor(state.page))
    : 0;
  const offset = page * limit;

  const params: AuditParams = { limit, offset };

  const q = state.q.trim();
  if (q) params.q = q;

  if (state.kind && VALID_KINDS.has(state.kind)) params.kind = state.kind;

  return params;
}
