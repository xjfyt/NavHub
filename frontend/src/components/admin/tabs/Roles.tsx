import { Icon } from "../../Icon";
import { ROLE_MATRIX, PERMISSIONS, ROLES } from "../../../constants/design";

export const AdminRoles = () => {
  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>角色 / 权限</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>各个角色的权限矩阵分布</div>
      </div>
      <table
        className="admin-table"
        style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}
      >
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>权限节点</th>
            {ROLES.map((r) => (
              <th key={r.id} style={{ padding: 12, textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>
                {r.label.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((p) => (
            <tr key={p.key} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12, fontSize: 14 }}>
                <div style={{ fontWeight: 500 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4 }}>{p.key}</div>
              </td>
              {ROLES.map((r) => (
                <td key={r.id} style={{ padding: 12, textAlign: "center" }}>
                  {ROLE_MATRIX[r.id]?.includes(p.key) ? (
                    <Icon name="check" size={16} color="var(--ok)" />
                  ) : (
                    <span style={{ color: "var(--admin-border-str)" }}>—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default AdminRoles;
