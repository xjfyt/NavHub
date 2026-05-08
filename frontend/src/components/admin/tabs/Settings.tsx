import { useEffect, useState } from "react";
import { api } from "../../../api";
import { toast } from "sonner";

export const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const load = async () => setSettings(await api.admin.settings());
  useEffect(() => {
    load();
  }, []);

  const toggle = async (key: string, val: boolean) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try {
      await api.admin.patchSettings({ [key]: val });
    } catch (e: any) {
      toast.error("Failed: " + e.message);
      load();
    }
  };

  const rows = [
    { key: "public_access", t: "公开访问", d: "无需登录即可浏览首页" },
    { key: "auto_assign_user_role", t: "新用户自动分配普通用户", d: "首次通过 SSO 登录的用户默认普通用户权限" },
    { key: "enable_drag_sort", t: "启用拖拽排序", d: "允许编辑者重新排列图标" },
    { key: "enable_iframe_preview", t: "启用 iframe 预览", d: "点击图标在弹窗中预览页面" },
    { key: "enable_audit_log", t: "启用审计日志", d: "保留操作记录" },
    { key: "developer_mode", t: "开发者模式", d: "暴露调试 API 与 Webhook (危险)" },
  ];

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>系统设置</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>控制整个实例的全局行为</div>
      </div>
      <div style={{ background: "var(--admin-card-bg)", borderRadius: 12, padding: "0 24px" }}>
        {rows.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 0",
              borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--admin-hover-soft)",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.t}</div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 4 }}>{s.d}</div>
            </div>
            <div
              onClick={() => toggle(s.key, !settings[s.key])}
              style={{
                display: "inline-block",
                width: 34,
                height: 20,
                borderRadius: 10,
                background: settings[s.key] ? "var(--ok)" : "var(--admin-border-str)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--text)",
                  position: "absolute",
                  top: 3,
                  left: settings[s.key] ? 17 : 3,
                  transition: "0.2s",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default AdminSettings;
