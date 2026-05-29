import { useEffect, useState } from "react";
import { api } from "../../../api";
import { ROLES } from "../../../constants/design";
import { toast } from "sonner";
import type { AdminUser } from "../../../types";
import { AdminUserAvatar } from "../shared";
import { confirmDialog } from "../../Dialogs";
import { useWorkspace } from "../../../hooks/useWorkspace";

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label.split(" ")[0] ?? id;

export const AdminUsers = () => {
  const { me } = useWorkspace();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState("all");
  const load = async () => setUsers(await api.admin.users());
  useEffect(() => {
    load();
  }, []);

  // UX-12: 改角色此前即时生效、无确认无反馈。加入二次确认 + 成功 toast,
  // 并在管理员修改「自己」角色时给出强警告(降权可能把自己锁在外面)。
  const changeRole = async (user: AdminUser, role: string) => {
    if (user.role === role) return;
    const isSelf = me?.id === user.id;
    const target = user.displayName || user.username;
    const base = `确定将「${target}」的角色从 ${roleLabel(user.role)} 改为 ${roleLabel(role)} 吗？`;
    const selfWarn =
      isSelf && role !== "superadmin" && role !== "admin"
        ? "\n\n⚠️ 你正在修改自己的角色并降低权限，可能会立刻失去管理后台的访问权，导致无法再改回来！"
        : isSelf
          ? "\n\n⚠️ 你正在修改自己的角色。"
          : "";
    const ok = await confirmDialog(base + selfWarn, isSelf ? "修改自己的角色" : "修改用户角色");
    if (!ok) {
      load(); // 取消时把下拉框恢复到原值
      return;
    }
    try {
      await api.admin.updateUser(user.id, { role });
      toast.success(`已将「${target}」设为 ${roleLabel(role)}`);
      load();
    } catch (e: any) {
      toast.error("修改角色失败：" + (e?.message || "未知错误"));
      load();
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
                  onChange={(e) => changeRole(u, e.target.value)}
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
