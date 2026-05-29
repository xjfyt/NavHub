import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { api } from "../../../api";
import { ROLES } from "../../../constants/design";
import type { AdminDashboardStats } from "../../../types";

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon?: string;
  tone?: "default" | "accent" | "warn";
}
const StatCard = ({ label, value, sub, icon, tone = "default" }: StatCardProps) => {
  const accent =
    tone === "accent" ? "var(--accent)" : tone === "warn" ? "#ff9b9b" : "var(--text-soft)";
  return (
    <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-soft)" }}>
        {icon && <Icon name={icon} size={13} color={accent} />}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 2px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-soft)" }}>{sub}</div>}
    </div>
  );
};

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <h3
    style={{
      fontSize: 16,
      margin: "0 0 20px 0",
      borderBottom: "1px solid var(--admin-border-str)",
      paddingBottom: 10,
    }}
  >
    {children}
  </h3>
);

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

  const topWallpaperMax = Math.max(1, ...stats.topWallpaperSources.map((s) => s.count));

  return (
    <>
      <div className="admin-head" style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>总览</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            实例概况 · {window.appName || "NavHub"} M2
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pill-btn" onClick={load}>
            <Icon name="activity" size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* Row 1 — 用户与导航主体 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <StatCard icon="users" label="总用户" value={stats.totalUsers} />
        <StatCard
          icon="activity"
          label="在线访问"
          value={stats.onlineUsers}
          sub="近 15 分钟活跃"
          tone={stats.onlineUsers > 0 ? "accent" : "default"}
        />
        <StatCard icon="grid" label="分组数" value={stats.totalGroups} />
        <StatCard
          icon="link"
          label="导航图标"
          value={stats.totalIcons}
          sub={`小组件 ${stats.totalWidgets}`}
        />
      </div>

      {/* Row 2 — 内容资源 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard
          icon="image"
          label="壁纸缓存"
          value={stats.totalWallpapers}
          sub={`图片 ${stats.wallpaperImageCount} · 视频 ${stats.wallpaperVideoCount}`}
          tone="accent"
        />
        <StatCard
          icon="cloud"
          label="壁纸来源"
          value={`${stats.wallpaperSourcesEnabled} / ${stats.wallpaperSourcesTotal}`}
          sub="启用 / 总数"
        />
        <StatCard
          icon="sparkle"
          label="图标资源"
          value={stats.totalIconAssets}
          sub="来自爬取与上传"
          tone="accent"
        />
        <StatCard
          icon="cloud"
          label="图标来源"
          value={`${stats.iconAssetSourcesEnabled} / ${stats.iconAssetSourcesTotal}`}
          sub="启用 / 总数"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <PanelTitle>最近活动</PanelTitle>
          {stats.recentAudit.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-soft)", padding: "12px 0" }}>暂无审计记录</div>
          ) : (
            <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
              <tbody>
                {stats.recentAudit.map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--admin-border-soft)" }}>
                    <td style={{ padding: "8px 0", color: "var(--text-soft)", whiteSpace: "nowrap" }}>
                      {new Date(log.ts).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 0" }}>{log.actorName || "System"}</td>
                    <td style={{ padding: "8px 0" }}>{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <PanelTitle>角色分布</PanelTitle>
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

      {/* Top wallpaper sources */}
      <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
        <PanelTitle>壁纸来源 · Top 5（按已缓存数量）</PanelTitle>
        {stats.topWallpaperSources.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-soft)", padding: "12px 0" }}>
            尚未配置任何壁纸来源
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.topWallpaperSources.map((s, i) => {
              const pct = (s.count / topWallpaperMax) * 100;
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>{s.name}</span>
                    <span className="mono" style={{ color: "var(--text-soft)" }}>{s.count} 张</span>
                  </div>
                  <div style={{ height: 6, background: "var(--admin-border)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: pct + "%",
                        background: "linear-gradient(90deg, var(--accent), #8fb8ff)",
                        transition: "width 600ms",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminDashboard;
