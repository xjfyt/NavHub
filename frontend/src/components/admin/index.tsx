import { lazy, Suspense, useState } from "react";
import { Icon } from "../Icon";
import { useWorkspace } from "../../hooks/useWorkspace";
import { ErrorBoundary } from "./shared";

// Each admin tab is its own chunk so navigating into the panel doesn't pull
// in a 60KB monolith for users who only need one screen.
const AdminDashboard = lazy(() => import("./tabs/Dashboard"));
const AdminUsers = lazy(() => import("./tabs/Users"));
const AdminMessages = lazy(() => import("./tabs/Messages"));
const AdminPush = lazy(() => import("./tabs/Push"));
const AdminAudit = lazy(() => import("./tabs/Audit"));
const AdminSettings = lazy(() => import("./tabs/Settings"));
const AdminSSO = lazy(() => import("./tabs/SSO"));
const AdminWallpaperLibrary = lazy(() =>
  import("./WallpaperLibrary").then((m) => ({ default: m.AdminWallpaperLibrary })),
);
const AdminIconAssetLibrary = lazy(() =>
  import("./IconAssetLibrary").then((m) => ({ default: m.AdminIconAssetLibrary })),
);

const TabFallback = () => (
  <div style={{ padding: 40, textAlign: "center", color: "var(--text-soft)" }}>加载中 …</div>
);

export const AdminShell = ({
  onClose,
  initialTab,
}: {
  onClose: () => void;
  initialTab?: string;
}) => {
  const [tab, setTab] = useState(initialTab || "dashboard");
  const { me, workspace } = useWorkspace();
  const isSuper = me?.role === "superadmin";

  const tabs = [
    { id: "dashboard", name: "总览", icon: "grid" },
    { id: "users", name: "用户管理", icon: "users" },
    { id: "messages", name: "消息推送", icon: "bell" },
    { id: "push", name: "推送分类", icon: "send" },
    { id: "wallpapers", name: "壁纸库", icon: "image" },
    { id: "iconAssets", name: "图标库", icon: "image" },
    ...(isSuper ? [{ id: "sso", name: "SSO 接入", icon: "key", super: true }] : []),
    { id: "audit", name: "审计日志", icon: "activity" },
    { id: "settings", name: "系统设置", icon: "settings" },
  ];

  return (
    <div
      className="admin-root theme-dark"
      style={{ background: "var(--admin-bg)", display: "flex", height: "100vh" }}
    >
      <div
        className="admin-side glass-strong"
        style={{
          width: 220,
          borderRight: "1px solid var(--admin-border-str)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h1 style={{ padding: "20px", fontSize: "18px", fontWeight: 600 }}>
          {(window as any).appName || "NavHub"}{" "}
          <span
            className="badge"
            style={{
              verticalAlign: "middle",
              fontSize: 10,
              padding: "2px 6px",
              background: "#e54b4b",
              borderRadius: 4,
              color: "var(--text)",
              marginLeft: 6,
            }}
          >
            ADMIN
          </span>
        </h1>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={"admin-nav " + (tab === t.id ? "active" : "")}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              background: tab === t.id ? "var(--admin-border-str)" : "transparent",
              borderLeft: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            <Icon name={t.icon} size={14} />
            <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
            {t.super && (
              <span
                className="super-chip"
                title="超级管理员专属"
                style={{
                  fontSize: 9,
                  background: "rgba(255,215,165,0.2)",
                  color: "var(--accent)",
                  padding: "2px 4px",
                  borderRadius: 4,
                }}
              >
                超管
              </span>
            )}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div
          className="admin-nav"
          onClick={onClose}
          style={{
            padding: "20px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--text-soft)",
          }}
        >
          <Icon name="chevron-left" size={14} />
          返回导航
        </div>
      </div>
      <div className="admin-main" style={{ flex: 1, padding: "30px 40px", overflowY: "auto" }}>
        <ErrorBoundary>
          <Suspense fallback={<TabFallback />}>
            {tab === "dashboard" && <AdminDashboard />}
            {tab === "users" && <AdminUsers />}
            {tab === "messages" && <AdminMessages />}
            {tab === "push" && <AdminPush groups={workspace.groups} />}
            {tab === "wallpapers" && <AdminWallpaperLibrary />}
            {tab === "iconAssets" && <AdminIconAssetLibrary />}
            {tab === "sso" && isSuper && <AdminSSO />}
            {tab === "audit" && <AdminAudit />}
            {tab === "settings" && <AdminSettings />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};
