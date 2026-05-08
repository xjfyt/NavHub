import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { api } from "../../../api";
import { ROLES } from "../../../constants/design";
import type { AdminDashboardStats } from "../../../types";

export const AdminDashboard = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  const load = async () => {
    try {
      setStats(await api.admin.dashboard());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!stats) return <div style={{ color: "var(--text-soft)" }}>Loading dashboard...</div>;

  return (
    <>
      <div className="admin-head" style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>总览</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            实例概况 · {(window as any).appName || "NavHub"} M2
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pill-btn" onClick={load}>
            <Icon name="activity" size={12} /> 刷新
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-soft)" }}>总用户</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{stats.totalUsers}</div>
        </div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-soft)" }}>在线访问</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{stats.onlineUsers}</div>
        </div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-soft)" }}>图标总数</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{stats.totalIcons}</div>
        </div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-soft)" }}>分组数</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{stats.totalGroups}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <h3
            style={{
              fontSize: 16,
              margin: "0 0 20px 0",
              borderBottom: "1px solid var(--admin-border-str)",
              paddingBottom: 10,
            }}
          >
            最近活动
          </h3>
          <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              {stats.recentAudit.map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--admin-border-soft)" }}>
                  <td style={{ padding: "8px 0", color: "var(--text-soft)" }}>
                    {new Date(log.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 0" }}>{log.actorName || "System"}</td>
                  <td style={{ padding: "8px 0" }}>{log.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <h3
            style={{
              fontSize: 16,
              margin: "0 0 20px 0",
              borderBottom: "1px solid var(--admin-border-str)",
              paddingBottom: 10,
            }}
          >
            角色分布
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ROLES.map((r) => {
              const count = stats.rolesDistribution[r.id] || 0;
              const pct = stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0;
              return (
                <div key={r.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>
                      <span className={`role-badge role-${r.id}`}>{r.label.split(" ")[0]}</span>
                    </span>
                    <span className="mono" style={{ color: "var(--text-soft)" }}>
                      {count} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "var(--admin-border)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: pct + "%",
                        background:
                          r.id === "superadmin"
                            ? "#ffc97a"
                            : r.id === "admin"
                              ? "#ff9b9b"
                              : r.id === "user"
                                ? "#8fb8ff"
                                : "#b8b8c8",
                        transition: "width 600ms",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
