import { useEffect, useState } from "react";
import { api } from "../../../api";
import { toast } from "sonner";
import { confirmDialog } from "../../Dialogs";

interface SettingRow {
  key: string;
  t: string;
  d: string;
  /** UX-13: 危险开关——开启时需二次确认,并视觉单列。 */
  danger?: boolean;
  /** 二次确认的额外说明。 */
  dangerHint?: string;
}

export const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const load = async () => setSettings(await api.admin.settings());
  useEffect(() => {
    load();
  }, []);

  const doToggle = async (key: string, val: boolean) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try {
      await api.admin.patchSettings({ [key]: val });
      toast.success(val ? "已开启" : "已关闭");
    } catch (e: any) {
      toast.error("保存失败：" + (e?.message || "未知错误"));
      load();
    }
  };

  const toggle = async (row: SettingRow, val: boolean) => {
    // UX-13: 危险开关「开启」方向需二次确认;关闭无需。
    if (row.danger && val) {
      const ok = await confirmDialog(
        `「${row.t}」是高风险设置。\n${row.dangerHint || row.d}\n\n确定要开启吗？`,
        "危险操作确认",
      );
      if (!ok) return;
    }
    await doToggle(row.key, val);
  };

  const rows: SettingRow[] = [
    { key: "auto_assign_user_role", t: "新用户自动分配普通用户", d: "首次通过 SSO 登录的用户默认普通用户权限" },
    { key: "enable_drag_sort", t: "启用拖拽排序", d: "允许编辑者重新排列图标" },
    { key: "enable_iframe_preview", t: "启用 iframe 预览", d: "点击图标在弹窗中预览页面" },
    { key: "enable_audit_log", t: "启用审计日志", d: "保留操作记录" },
  ];

  const dangerRows: SettingRow[] = [
    {
      key: "public_access",
      t: "公开访问",
      d: "无需登录即可浏览首页",
      danger: true,
      dangerHint: "开启后任何人无需登录即可访问本站首页内容。",
    },
    {
      key: "developer_mode",
      t: "开发者模式",
      d: "暴露调试 API 与 Webhook",
      danger: true,
      dangerHint: "开启后将暴露调试 API 与 Webhook，可能带来安全风险，仅在排障时使用。",
    },
  ];

  const Switch = ({ row }: { row: SettingRow }) => (
    <div
      onClick={() => toggle(row, !settings[row.key])}
      style={{
        display: "inline-block",
        width: 34,
        height: 20,
        borderRadius: 10,
        background: settings[row.key]
          ? row.danger
            ? "var(--danger, #e05260)"
            : "var(--ok)"
          : "var(--admin-border-str)",
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
          left: settings[row.key] ? 17 : 3,
          transition: "0.2s",
        }}
      />
    </div>
  );

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>系统设置</h2>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>控制整个实例的全局行为</div>
      </div>
      <div style={{ background: "var(--admin-card-bg)", borderRadius: 12, padding: "0 24px" }}>
        {rows.map((s, i) => (
          <div
            key={s.key}
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
            <Switch row={s} />
          </div>
        ))}
      </div>

      {/* UX-13: 危险设置单独成区,视觉上明显区隔(红色边框 + 标题),开启需二次确认。 */}
      <div
        style={{
          marginTop: 28,
          background: "var(--admin-card-bg)",
          border: "1px solid var(--danger, #e05260)",
          borderRadius: 12,
          padding: "4px 24px 8px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 0 8px",
            color: "var(--danger, #e05260)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ⚠️ 危险设置
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-soft)" }}>
            以下开关影响安全/可见性，开启时需二次确认
          </span>
        </div>
        {dangerRows.map((s, i) => (
          <div
            key={s.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 0",
              borderTop: "1px solid var(--admin-hover-soft)",
              borderBottom: i === dangerRows.length - 1 ? "none" : undefined,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.t}</div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 4 }}>{s.d}</div>
            </div>
            <Switch row={s} />
          </div>
        ))}
      </div>
    </>
  );
};

export default AdminSettings;
