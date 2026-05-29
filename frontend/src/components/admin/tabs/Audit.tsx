import { useEffect, useState } from "react";
import { api } from "../../../api";
import type { AuditEntry } from "../../../types";
import { AUDIT_KINDS, DEFAULT_AUDIT_PAGE_SIZE, buildAuditParams } from "../../../utils/auditQuery";

const inputStyle: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 13,
  borderRadius: 8,
  background: "var(--admin-bg)",
  border: "1px solid var(--admin-border-str)",
  color: "var(--text)",
};

export const AdminAudit = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = DEFAULT_AUDIT_PAGE_SIZE;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // 搜索框输入做 300ms 防抖,避免逐字符打到后端。
    const delay = q ? 300 : 0;
    const timer = setTimeout(() => {
      api.admin
        .audit(buildAuditParams({ q, kind, page, pageSize }))
        .then((rows) => {
          if (alive) setLogs(rows);
        })
        .catch(() => {
          if (alive) setLogs([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, kind, page, pageSize]);

  // 后端只返回数组、没有 total,因此用「本页是否拿满」来判断是否还有下一页。
  const hasNext = logs.length >= pageSize;

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>审计日志</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
          操作记录查询，支持按关键词、对象类型筛选与分页浏览。
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="搜索行为 / 对象 / 操作者…"
          aria-label="搜索审计日志"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <select
          value={kind}
          onChange={(e) => { setKind(e.target.value); setPage(0); }}
          aria-label="按对象类型筛选"
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">全部类型</option>
          {AUDIT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
      </div>

      <table
        className="admin-table"
        style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}
      >
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>时间</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>操作者</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>行为</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>类型</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>对象</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>
                加载中…
              </td>
            </tr>
          ) : logs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>
                没有符合条件的记录
              </td>
            </tr>
          ) : (
            logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
                <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }} className="mono">
                  {new Date(l.ts).toLocaleString()}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>{l.actorName || "System"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{l.action}</td>
                <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }}>
                  {AUDIT_KINDS.find((k) => k.id === l.kind)?.label ?? l.kind}
                </td>
                <td style={{ padding: 12, fontSize: 13, color: "var(--text-soft)" }}>{l.target || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 18 }}>
        <button
          type="button"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: page === 0 || loading ? 0.4 : 1 }}
        >
          上一页
        </button>
        <span style={{ lineHeight: "30px", fontSize: 13, color: "var(--text-soft)" }}>第 {page + 1} 页</span>
        <button
          type="button"
          disabled={!hasNext || loading}
          onClick={() => setPage((p) => p + 1)}
          style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: !hasNext || loading ? 0.4 : 1 }}
        >
          下一页
        </button>
      </div>
    </>
  );
};

export default AdminAudit;
