import { useEffect, useState } from "react";
import { api } from "../../../api";
import { ROLES } from "../../../constants/design";
import { toast } from "sonner";
import type { AdminUser } from "../../../types";
import { AdminUserAvatar } from "../shared";

export const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState("all");
  const load = async () => setUsers(await api.admin.users());
  useEffect(() => {
    load();
  }, []);

  const changeRole = async (id: string, role: string) => {
    try {
      await api.admin.updateUser(id, { role });
      load();
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    }
  };

  const filtered = users.filter((u) => filter === "all" || u.role === filter);

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>用户管理</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>所有接入的用户及角色分配</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        {[{ id: "all", name: "全部" }, ...ROLES.map((r) => ({ id: r.id, name: r.label.split(" ")[0] }))].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "6px 12px",
              background: filter === f.id ? "var(--accent)" : "var(--admin-border-str)",
              color: filter === f.id ? "var(--text-inv)" : "var(--text)",
              borderRadius: 8,
              marginRight: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {f.name}
          </button>
        ))}
      </div>
      <table
        className="admin-table"
        style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}
      >
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>用户</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>角色</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>来源</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>注册时间</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AdminUserAvatar avatarUrl={u.avatarUrl} name={u.displayName || u.username} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 11, color: "var(--text-soft)" }}>{u.email || "—"}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: 12 }}>
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  style={{
                    background: "var(--admin-border-str)",
                    color: "var(--text)",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: 4,
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id} style={{ color: "var(--text-inv)" }}>
                      {r.label.split(" ")[0]}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ padding: 12, fontSize: 13 }}>
                <span className="badge" style={{ background: "var(--admin-border-str)", padding: "2px 6px", borderRadius: 4 }}>
                  {u.casdoorBound ? "Casdoor" : "Local"}
                </span>
              </td>
              <td style={{ padding: 12, fontSize: 13, color: "var(--text-soft)" }}>
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default AdminUsers;
