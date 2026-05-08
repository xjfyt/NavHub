import { useEffect, useState } from "react";
import { api } from "../../../api";
import type { AuditEntry } from "../../../types";

export const AdminAudit = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const load = async () => setLogs(await api.admin.audit({ limit: 100 }));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>审计日志</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>操作记录查询，最高展示最近 100 条</div>
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
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>对象</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }} className="mono">
                {new Date(l.ts).toLocaleString()}
              </td>
              <td style={{ padding: 12, fontSize: 13 }}>{l.actorName || "System"}</td>
              <td style={{ padding: 12, fontSize: 13 }}>{l.action}</td>
              <td style={{ padding: 12, fontSize: 13, color: "var(--text-soft)" }}>{l.target || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default AdminAudit;
