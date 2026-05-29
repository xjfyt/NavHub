import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { api } from "../../../api";
import { toast } from "sonner";
import { confirmDialog } from "../../Dialogs";
import { useWorkspace } from "../../../hooks/useWorkspace";
import type { AdminUser, GroupView, MessageTargetType } from "../../../types";
import { MESSAGE_TARGETS, PUSHABLE_ROLES } from "../shared";

export const AdminPush = ({ groups }: { groups: GroupView[] }) => {
  const { refreshWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    detail: string;
    percent: number;
  } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pushingGroupId, setPushingGroupId] = useState<string | null>(null);
  const [form, setForm] = useState({
    targetType: "all" as MessageTargetType,
    targetRole: "user",
    targetUserId: "",
    pushAllowEdit: false,
  });

  useEffect(() => {
    api.admin.users().then(setUsers).catch(console.error);
  }, []);

  const exportCategory = async (id: string, name: string) => {
    try {
      setImportProgress({ phase: "导出分类", detail: "正在打包分类与本地图标资源...", percent: 15 });
      const data = await api.admin.exportGroup(id);
      setImportProgress({ phase: "生成文件", detail: "正在生成 JSON 文件...", percent: 80 });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Category_${name.replace(/\s+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setImportProgress({ phase: "导出完成", detail: "分类 JSON 已包含可打包的本地图标资源。", percent: 100 });
      window.setTimeout(() => setImportProgress(null), 700);
    } catch (e: any) {
      toast.error("导出失败：" + e.message);
      setImportProgress(null);
    }
  };

  const importCategory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let timer: number | undefined;
    try {
      setLoading(true);
      setImportProgress({ phase: "读取文件", detail: file.name, percent: 5 });
      const text = await file.text();
      setImportProgress({ phase: "解析 JSON", detail: "正在检查分类、图标和组件数据...", percent: 15 });
      await nextFrame();
      const data = JSON.parse(text);
      const iconCount = Array.isArray(data.icons) ? data.icons.length : 0;
      const folderItemCount = Array.isArray(data.icons)
        ? data.icons.reduce((sum: number, icon: any) => sum + (Array.isArray(icon.folderItems) ? icon.folderItems.length : 0), 0)
        : 0;
      const widgetCount = Array.isArray(data.widgets) ? data.widgets.length : 0;
      const assetCount = Array.isArray(data.icons)
        ? data.icons.reduce((sum: number, icon: any) => {
            const self = icon.imageAsset ? 1 : 0;
            const children = Array.isArray(icon.folderItems)
              ? icon.folderItems.filter((item: any) => item.imageAsset).length
              : 0;
            return sum + self + children;
          }, 0)
        : 0;
      setImportProgress({
        phase: "写入服务器",
        detail: `${iconCount} 个图标、${folderItemCount} 个文件夹项、${widgetCount} 个组件、${assetCount} 个图标资源`,
        percent: 30,
      });
      timer = window.setInterval(() => {
        setImportProgress((prev) => {
          if (!prev || prev.percent >= 88) return prev;
          const step = prev.percent < 60 ? 4 : 2;
          return { ...prev, percent: Math.min(88, prev.percent + step) };
        });
      }, 500);
      await api.admin.importGroup(data);
      if (timer) window.clearInterval(timer);
      setImportProgress({ phase: "刷新工作区", detail: "导入完成，正在刷新分类列表...", percent: 94 });
      refreshWorkspace();
      setImportProgress({ phase: "导入完成", detail: "新分类已经可用。", percent: 100 });
      toast.success("分类导入完成");
      window.setTimeout(() => setImportProgress(null), 900);
    } catch (err: any) {
      if (timer) window.clearInterval(timer);
      toast.error("导入失败：" + err.message);
      setImportProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const initPush = async (id: string, isPushed: boolean) => {
    if (isPushed) {
      if (await confirmDialog("确定取消对该分类的推送吗？")) {
        unpush(id);
      }
    } else {
      setPushingGroupId(id);
    }
  };

  const submitPush = async () => {
    if (!pushingGroupId) return;
    if (form.targetType === "user" && !form.targetUserId) {
      toast.error("请先选择用户");
      return;
    }
    setLoading(true);
    try {
      await api.admin.pushGroup(pushingGroupId, {
        targetType: form.targetType,
        targetRole: form.targetType === "role" ? form.targetRole : null,
        targetUserId: form.targetType === "user" ? form.targetUserId : null,
        pushAllowEdit: form.pushAllowEdit,
      });
      refreshWorkspace();
      toast.success("配置已更新");
    } catch (e: any) {
      toast.error("操作失败：" + e.message);
    }
    setLoading(false);
    setPushingGroupId(null);
  };

  const unpush = async (id: string) => {
    setLoading(true);
    try {
      await api.admin.unpushGroup(id);
      refreshWorkspace();
      toast.success("推送已取消");
    } catch (e: any) {
      toast.error("取消失败：" + e.message);
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--admin-border-str)",
    background: "var(--admin-border-soft)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      <div
        className="admin-head"
        style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>推送分类</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            强制下发分类给目标用户。用户仅能调整推送分类的壁纸与排序。
          </div>
        </div>
        <div>
          <label
            className="pill-btn primary"
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Icon name="download" size={12} /> 导入分类 JSON
            <input type="file" accept=".json" style={{ display: "none" }} onChange={importCategory} disabled={loading} />
          </label>
        </div>
      </div>
      <table
        className="admin-table"
        style={{
          width: "100%",
          background: "var(--admin-card-bg)",
          borderRadius: 12,
          overflow: "hidden",
          opacity: loading ? 0.5 : 1,
        }}
      >
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>图标</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>分类</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>所有者</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>当前推送目标</th>
            <th style={{ padding: 12, textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>允许编辑</th>
            <th style={{ padding: 12, textAlign: "right", fontSize: 13, color: "var(--text-soft)" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12 }}>
                <Icon name={g.icon || "list"} size={16} />
              </td>
              <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{g.name}</td>
              <td style={{ padding: 12, fontSize: 13 }}>{g.ownerName || g.ownerId || "系统全局"}</td>
              <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }}>
                {g.pushed ? (
                  <>
                    {g.pushTargetType === "all"
                      ? "全体用户"
                      : g.pushTargetType === "role"
                        ? `角色: ${g.pushTargetRole}`
                        : g.pushTargetType === "user"
                          ? `特定用户`
                          : "已知目标"}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td style={{ padding: 12, fontSize: 12, textAlign: "center" }}>
                {g.pushed ? (
                  g.pushAllowEdit ? (
                    <Icon name="check" size={14} color="var(--ok)" />
                  ) : (
                    <span style={{ color: "var(--admin-border-str)" }}>—</span>
                  )
                ) : (
                  <span style={{ color: "var(--admin-border-str)" }}>—</span>
                )}
              </td>
              <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                <button
                  className="pill-btn"
                  onClick={() => exportCategory(g.id, g.name)}
                  style={{ display: "inline-flex", marginRight: 16 }}
                >
                  <Icon name="upload" size={12} /> 导出
                </button>
                <div
                  onClick={() => initPush(g.id, g.pushed)}
                  style={{
                    display: "inline-block",
                    width: 34,
                    height: 20,
                    borderRadius: 10,
                    background: g.pushed ? "var(--ok)" : "var(--admin-border-str)",
                    cursor: "pointer",
                    position: "relative",
                    verticalAlign: "middle",
                  }}
                  title={g.pushed ? "取消推送" : "配置强力推送"}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--text)",
                      position: "absolute",
                      top: 3,
                      left: g.pushed ? 17 : 3,
                      transition: "0.2s",
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pushingGroupId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="glass-strong"
            style={{ width: 400, borderRadius: 16, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>配置推送下发目标</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>推送范围</div>
                <select
                  style={inputStyle}
                  value={form.targetType}
                  onChange={(e) => setForm((s) => ({ ...s, targetType: e.target.value as MessageTargetType }))}
                >
                  {MESSAGE_TARGETS.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              {form.targetType === "role" && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标角色</div>
                  <select
                    style={inputStyle}
                    value={form.targetRole}
                    onChange={(e) => setForm((s) => ({ ...s, targetRole: e.target.value }))}
                  >
                    {PUSHABLE_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label.split(" ")[0]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.targetType === "user" && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标用户</div>
                  <select
                    style={inputStyle}
                    value={form.targetUserId}
                    onChange={(e) => setForm((s) => ({ ...s, targetUserId: e.target.value }))}
                  >
                    <option value="">请选择用户</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {(u.displayName || u.username)} · {u.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.pushAllowEdit}
                    onChange={(e) => setForm((s) => ({ ...s, pushAllowEdit: e.target.checked }))}
                  />
                  允许用户进行编辑
                </label>
                <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4, marginLeft: 21 }}>
                  勾选后，该推送分类的内容即可被接受者自由编辑，开放所有编辑功能。
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  className="pill-btn"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setPushingGroupId(null)}
                >
                  取消
                </button>
                <button
                  className="pill-btn primary"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={submitPush}
                  disabled={loading}
                >
                  {loading ? "下发中..." : "确认推送"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importProgress && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            className="glass-strong"
            style={{ width: "min(420px, 100%)", borderRadius: 14, padding: 20 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Icon name={importProgress.percent >= 100 ? "check" : "activity"} size={18} />
              <div style={{ fontSize: 15, fontWeight: 700 }}>{importProgress.phase}</div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-soft)" }}>
                {Math.round(importProgress.percent)}%
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 12 }}>
              {importProgress.detail}
            </div>
            <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}>
              <div
                style={{
                  width: `${importProgress.percent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--accent)",
                  transition: "width 240ms ease",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPush;
