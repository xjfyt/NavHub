import { Component, useState, useEffect, type ReactNode } from "react";
import { Icon } from "../Icon";
import { useWorkspace } from "../../hooks/useWorkspace";
import { api } from "../../api";
import { toast } from "sonner";
import { confirmDialog } from "../Dialogs";
import type {
  AdminDashboardStats,
  AdminMessage,
  AdminUser,
  AuditEntry,
  GroupView,
  MessageLevel,
  MessageTargetType,
} from "../../types";
import { ROLE_MATRIX, PERMISSIONS, ROLES } from "../../constants/design";
import { AdminWallpaperLibrary } from "./WallpaperLibrary";
import { AdminIconAssetLibrary } from "./IconAssetLibrary";

const MESSAGE_LEVELS: { id: MessageLevel; name: string }[] = [
  { id: "info", name: "普通" },
  { id: "success", name: "成功" },
  { id: "warning", name: "提醒" },
  { id: "error", name: "紧急" },
];

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("ErrorBoundary caught:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 20, color: 'red', background: '#fee' }}>
         <h3>Admin Panel Crash</h3>
         <pre>{String(this.state.error?.stack || this.state.error)}</pre>
      </div>;
    }
    return this.props.children;
  }
}


const MESSAGE_TARGETS: { id: MessageTargetType; name: string }[] = [
  { id: "role", name: "按角色" },
  { id: "user", name: "指定用户" },
  { id: "all", name: "全体用户" },
];

const PUSHABLE_ROLES = ROLES.filter((r) => r.id !== "guest");

const levelBadgeStyle = (level: MessageLevel): React.CSSProperties => {
  if (level === "success") return { background: "rgba(62, 190, 120, 0.16)", color: "#8ee6b8" };
  if (level === "warning") return { background: "rgba(255, 196, 87, 0.16)", color: "#ffd778" };
  if (level === "error") return { background: "rgba(255, 110, 110, 0.16)", color: "#ff9b9b" };
  return { background: "rgba(120, 180, 255, 0.16)", color: "#8fb8ff" };
};

const messageTargetText = (msg: Pick<AdminMessage, "targetType" | "targetRole" | "targetUserName">) => {
  if (msg.targetType === "all") return "全体登录用户";
  if (msg.targetType === "role") {
    return `角色 · ${ROLES.find((r) => r.id === msg.targetRole)?.label.split(" ")[0] || msg.targetRole}`;
  }
  return `用户 · ${msg.targetUserName || "指定用户"}`;
};

const AdminUserAvatar = ({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) => {
  const [broken, setBroken] = useState(false);
  const text = name.trim().slice(0, 2).toUpperCase() || "U";

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setBroken(true)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
          background: "var(--admin-border-soft)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--accent)",
        color: "var(--text-inv)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
      }}
    >
      {text}
    </div>
  );
};

export const AdminShell = ({ onClose, initialTab }: { onClose: () => void, initialTab?: string }) => {
  const [tab, setTab] = useState(initialTab || "dashboard");
  const { me, workspace } = useWorkspace();
  const isSuper = me?.role === "superadmin";

  const tabs = [
    { id: "dashboard", name: "总览", icon: "grid" },
    { id: "users", name: "用户管理", icon: "users" },
    { id: "roles", name: "角色 / 权限", icon: "shield" },
    { id: "messages", name: "消息推送", icon: "bell" },
    { id: "push", name: "推送分类", icon: "send" },
    { id: "wallpapers", name: "壁纸库", icon: "image" },
    { id: "iconAssets", name: "图标库", icon: "image" },
    ...(isSuper ? [{ id: "sso", name: "SSO 接入", icon: "key", super: true }] : []),
    { id: "audit", name: "审计日志", icon: "activity" },
    { id: "settings", name: "系统设置", icon: "settings" },
  ];

  return (
    <div className="admin-root theme-dark" style={{ background: 'var(--admin-bg)', display: "flex", height: "100vh" }}>
      <div className="admin-side glass-strong" style={{ width: 220, borderRight: '1px solid var(--admin-border-str)', display: "flex", flexDirection: "column" }}>
        <h1 style={{ padding: '20px', fontSize: '18px', fontWeight: 600 }}>
          {(window as any).appName || "NavHub"} <span className="badge" style={{ verticalAlign: 'middle', fontSize: 10, padding: '2px 6px', background: '#e54b4b', borderRadius: 4, color: 'var(--text)', marginLeft: 6 }}>ADMIN</span>
        </h1>
        {tabs.map(t => (
          <div key={t.id} className={"admin-nav " + (tab === t.id ? "active" : "")} onClick={() => setTab(t.id)} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: tab === t.id ? 'var(--admin-border-str)' : 'transparent', borderLeft: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent' }}>
            <Icon name={t.icon} size={14}/>
            <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
            {t.super && <span className="super-chip" title="超级管理员专属" style={{ fontSize: 9, background: 'rgba(255,215,165,0.2)', color: 'var(--accent)', padding: '2px 4px', borderRadius: 4 }}>超管</span>}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="admin-nav" onClick={onClose} style={{ padding: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-soft)' }}>
          <Icon name="chevron-left" size={14}/>返回导航
        </div>
      </div>
      <div className="admin-main" style={{ flex: 1, padding: '30px 40px', overflowY: 'auto' }}>
        <ErrorBoundary>
        {tab === "dashboard" && <AdminDashboard />}
        {tab === "users" && <AdminUsers />}
        {tab === "roles" && <AdminRoles />}
        {tab === "messages" && <AdminMessages />}
        {tab === "push" && <AdminPush groups={workspace.groups} />}
        {tab === "wallpapers" && <AdminWallpaperLibrary />}
        {tab === "iconAssets" && <AdminIconAssetLibrary />}
        {tab === "sso" && isSuper && <AdminSSO />}
        {tab === "audit" && <AdminAudit />}
        {tab === "settings" && <AdminSettings />}
        </ErrorBoundary>
      </div>
    </div>
  );
};

const AdminMessages = () => {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    level: "info" as MessageLevel,
    targetType: "role" as MessageTargetType,
    targetRole: "user",
    targetUserId: "",
    linkUrl: "",
    expiresAt: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [msgRows, userRows] = await Promise.all([api.admin.messages(), api.admin.users()]);
      setMessages(msgRows);
      setUsers(userRows);
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.admin.createMessage({
        title: form.title,
        content: form.content,
        level: form.level,
        targetType: form.targetType,
        targetRole: form.targetType === "role" ? form.targetRole : null,
        targetUserId: form.targetType === "user" ? form.targetUserId : null,
        linkUrl: form.linkUrl.trim() || null,
        expiresAt: form.expiresAt.trim() ? new Date(form.expiresAt).toISOString() : null,
      });
      setForm((s) => ({
        ...s,
        title: "",
        content: "",
    targetUserId: "",
        linkUrl: "",
        expiresAt: "",
      }));
      await load();
      toast.success("消息已推送");
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    }
    setSubmitting(false);
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog("删除后用户收件箱里也会消失，继续吗？"))) return;
    try {
      await api.admin.deleteMessage(id);
      setMessages((rows) => rows.filter((row) => row.id !== id));
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--admin-border-str)",
    background: "var(--admin-border-soft)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>消息推送</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>向指定用户、角色或全体用户下发系统通知，用户可在“偏好设置 → 消息通知”查看。</div>
        </div>
        <button className="pill-btn" onClick={load}><Icon name="activity" size={12}/> 刷新</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 18px 0" }}>新建推送</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>消息标题</div>
              <input style={inputStyle} value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="例如：今晚 22:00 维护升级" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>消息内容</div>
              <textarea
                style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                value={form.content}
                onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))}
                placeholder="请输入要推送给用户的正文。"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>级别</div>
                <select style={inputStyle} value={form.level} onChange={(e) => setForm((s) => ({ ...s, level: e.target.value as MessageLevel }))}>
                  {MESSAGE_LEVELS.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>推送范围</div>
                <select style={inputStyle} value={form.targetType} onChange={(e) => setForm((s) => ({ ...s, targetType: e.target.value as MessageTargetType }))}>
                  {MESSAGE_TARGETS.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
            </div>

            {form.targetType === "role" && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标角色</div>
                <select style={inputStyle} value={form.targetRole} onChange={(e) => setForm((s) => ({ ...s, targetRole: e.target.value }))}>
                  {PUSHABLE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label.split(" ")[0]}</option>)}
                </select>
              </div>
            )}

            {form.targetType === "user" && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标用户</div>
                <select style={inputStyle} value={form.targetUserId} onChange={(e) => setForm((s) => ({ ...s, targetUserId: e.target.value }))}>
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
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>附带链接</div>
              <input style={inputStyle} value={form.linkUrl} onChange={(e) => setForm((s) => ({ ...s, linkUrl: e.target.value }))} placeholder="https://example.com/changelog" />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>过期时间 (可选)</div>
              <input type="datetime-local" style={inputStyle} value={form.expiresAt} onChange={(e) => setForm((s) => ({ ...s, expiresAt: e.target.value }))} />
            </div>

            <button className="pill-btn primary" onClick={submit} disabled={submitting} style={{ justifyContent: "center", opacity: submitting ? 0.7 : 1 }}>
              <Icon name="send" size={12}/> {submitting ? "发送中..." : "立即推送"}
            </button>
          </div>
        </div>

        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16, minHeight: 420, opacity: loading ? 0.7 : 1 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 18px 0" }}>推送历史</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {messages.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)" }}>暂无推送记录</div>
            ) : messages.map((msg) => (
              <div key={msg.id} style={{ border: "1px solid var(--admin-border-slight)", borderRadius: 14, padding: 16, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ ...levelBadgeStyle(msg.level), padding: "3px 8px", borderRadius: 999, fontSize: 11 }}>
                        {MESSAGE_LEVELS.find((it) => it.id === msg.level)?.name || msg.level}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{messageTargetText(msg)}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{msg.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: "var(--text-mute)" }}>
                      <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      <span>发布者：{msg.createdByName || "系统"}</span>
                      {msg.expiresAt && <span>过期时间：{new Date(msg.expiresAt).toLocaleString()}</span>}
                      {msg.linkUrl ? <a href={msg.linkUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>附带链接</a> : null}
                    </div>
                  </div>
                  <button className="pill-btn" onClick={() => remove(msg.id)} style={{ color: "#ffb3b3" }}>
                    <Icon name="trash" size={12}/> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  
  const load = async () => {
    try { setStats(await api.admin.dashboard()); } catch (e) { console.error(e); }
  };
  
  useEffect(() => { load(); }, []);

  if (!stats) return <div style={{ color: "var(--text-soft)" }}>Loading dashboard...</div>;

  return (
    <>
      <div className="admin-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>总览</h2>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>实例概况 · {(window as any).appName || "NavHub"} M2</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pill-btn" onClick={load}><Icon name="activity" size={12}/> 刷新</button>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}><div style={{fontSize: 12, color: 'var(--text-soft)'}}>总用户</div><div style={{fontSize: 28, fontWeight: 700, margin: '8px 0'}}>{stats.totalUsers}</div></div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}><div style={{fontSize: 12, color: 'var(--text-soft)'}}>在线访问</div><div style={{fontSize: 28, fontWeight: 700, margin: '8px 0'}}>{stats.onlineUsers}</div></div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}><div style={{fontSize: 12, color: 'var(--text-soft)'}}>图标总数</div><div style={{fontSize: 28, fontWeight: 700, margin: '8px 0'}}>{stats.totalIcons}</div></div>
        <div className="widget w-notes glass-strong" style={{ padding: 20, borderRadius: 16 }}><div style={{fontSize: 12, color: 'var(--text-soft)'}}>分组数</div><div style={{fontSize: 28, fontWeight: 700, margin: '8px 0'}}>{stats.totalGroups}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
           <h3 style={{ fontSize: 16, margin: '0 0 20px 0', borderBottom: '1px solid var(--admin-border-str)', paddingBottom: 10 }}>最近活动</h3>
           <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
             <tbody>
                {stats.recentAudit.map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--admin-border-soft)" }}>
                    <td style={{ padding: "8px 0", color: "var(--text-soft)" }}>{new Date(log.ts).toLocaleString()}</td>
                    <td style={{ padding: "8px 0" }}>{log.actorName || "System"}</td>
                    <td style={{ padding: "8px 0" }}>{log.action}</td>
                  </tr>
                ))}
             </tbody>
           </table>
        </div>
        <div className="widget glass-strong" style={{ padding: 20, borderRadius: 16 }}>
           <h3 style={{ fontSize: 16, margin: '0 0 20px 0', borderBottom: '1px solid var(--admin-border-str)', paddingBottom: 10 }}>角色分布</h3>
           <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ROLES.map(r => {
                 const count = stats.rolesDistribution[r.id] || 0;
                 const pct = stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0;
                 return (
                   <div key={r.id}>
                     <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
                        <span><span className={`role-badge role-${r.id}`}>{r.label.split(' ')[0]}</span></span>
                        <span className="mono" style={{color:'var(--text-soft)'}}>{count} · {pct.toFixed(0)}%</span>
                     </div>
                     <div style={{height:4, background:'var(--admin-border)', borderRadius:2, overflow:'hidden'}}>
                        <div style={{height:'100%', width: pct+'%', background: r.id==='superadmin'?'#ffc97a':r.id==='admin'?'#ff9b9b':r.id==='user'?'#8fb8ff':'#b8b8c8', transition:'width 600ms'}}/>
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

const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState("all");
  const load = async () => setUsers(await api.admin.users());
  useEffect(() => { load(); }, []);

  const changeRole = async (id: string, role: string) => {
    try {
      await api.admin.updateUser(id, { role });
      load();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const filtered = users.filter(u => filter === "all" || u.role === filter);

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>用户管理</h2>
        <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>所有接入的用户及角色分配</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        {[{id:'all', name:'全部'}, ...ROLES.map(r => ({id: r.id, name: r.label.split(' ')[0]}))].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "6px 12px", background: filter === f.id ? "var(--accent)" : "var(--admin-border-str)", color: filter === f.id ? "var(--text-inv)" : "var(--text)", borderRadius: 8, marginRight: 8, border: "none", cursor: "pointer", fontSize: 12 }}>
            {f.name}
          </button>
        ))}
      </div>
      <table className="admin-table" style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}>
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>用户</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>角色</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>来源</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>注册时间</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AdminUserAvatar
                    avatarUrl={u.avatarUrl}
                    name={u.displayName || u.username}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 11, color: "var(--text-soft)" }}>{u.email || "—"}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: 12 }}>
                <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} style={{ background: "var(--admin-border-str)", color: "var(--text)", border: "none", padding: "4px 8px", borderRadius: 4 }}>
                  {ROLES.map(r => <option key={r.id} value={r.id} style={{ color: "var(--text-inv)" }}>{r.label.split(' ')[0]}</option>)}
                </select>
              </td>
              <td style={{ padding: 12, fontSize: 13 }}>
                <span className="badge" style={{ background: "var(--admin-border-str)", padding: "2px 6px", borderRadius: 4 }}>{u.casdoorBound ? "Casdoor" : "Local"}</span>
              </td>
              <td style={{ padding: 12, fontSize: 13, color: "var(--text-soft)" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

const AdminRoles = () => {
  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>角色 / 权限</h2>
        <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>各个角色的权限矩阵分布</div>
      </div>
      <table className="admin-table" style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}>
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>权限节点</th>
            {ROLES.map(r => <th key={r.id} style={{ padding: 12, textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>{r.label.split(' ')[0]}</th>)}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map(p => (
            <tr key={p.key} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12, fontSize: 14 }}>
                <div style={{ fontWeight: 500 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4 }}>{p.key}</div>
              </td>
              {ROLES.map(r => (
                <td key={r.id} style={{ padding: 12, textAlign: "center" }}>
                   {ROLE_MATRIX[r.id]?.includes(p.key) ? <Icon name="check" size={16} color="var(--ok)" /> : <span style={{ color: "var(--admin-border-str)" }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

const AdminPush = ({ groups }: { groups: GroupView[] }) => {
  const { refreshWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
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
      const data = await api.admin.exportGroup(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Category_${name.replace(/\s+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    }
  };

  const importCategory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setLoading(true);
        await api.admin.importGroup(data);
        refreshWorkspace();
      } catch (err: any) {
        toast.error("Import failed: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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
    if (form.targetType === "user" && !form.targetUserId) { toast.error("请先选择用户"); return; }
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
    } catch (e: any) { toast.error("Failed: " + e.message); }
    setLoading(false);
    setPushingGroupId(null);
  };

  const unpush = async (id: string) => {
    setLoading(true);
    try {
      await api.admin.unpushGroup(id);
      refreshWorkspace();
      toast.success("推送已取消");
    } catch (e: any) { toast.error("Failed: " + e.message); }
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
      <div className="admin-head" style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>推送分类</h2>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>强制下发分类给目标用户。用户仅能调整推送分类的壁纸与排序。</div>
        </div>
        <div>
           <label className="pill-btn primary" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="download" size={12}/> 导入分类 JSON
              <input type="file" accept=".json" style={{ display: "none" }} onChange={importCategory} disabled={loading} />
           </label>
        </div>
      </div>
      <table className="admin-table" style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden", opacity: loading ? 0.5 : 1 }}>
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
          {groups.map(g => (
            <tr key={g.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12 }}><Icon name={g.icon || "list"} size={16} /></td>
              <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{g.name}</td>
              <td style={{ padding: 12, fontSize: 13 }}>{g.ownerName || g.ownerId || "系统全局"}</td>
              <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }}>
                {g.pushed ? (
                  <>
                  {g.pushTargetType === 'all' ? '全体用户' :
                   g.pushTargetType === 'role' ? `角色: ${g.pushTargetRole}` :
                   g.pushTargetType === 'user' ? `特定用户` : '已知目标'}
                  </>
                ) : '—'}
              </td>
              <td style={{ padding: 12, fontSize: 12, textAlign: "center" }}>
                {g.pushed ? (
                  g.pushAllowEdit ? <Icon name="check" size={14} color="var(--ok)" /> : <span style={{ color: "var(--admin-border-str)" }}>—</span>
                ) : <span style={{ color: "var(--admin-border-str)" }}>—</span>}
              </td>
              <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="pill-btn" onClick={() => exportCategory(g.id, g.name)} style={{ display: "inline-flex", marginRight: 16 }}>
                   <Icon name="upload" size={12}/> 导出
                </button>
                <div onClick={() => initPush(g.id, g.pushed)} style={{ display: "inline-block", width: 34, height: 20, borderRadius: 10, background: g.pushed ? "var(--ok)" : "var(--admin-border-str)", cursor: "pointer", position: "relative", verticalAlign: "middle" }} title={g.pushed ? "取消推送" : "配置强力推送"}>
                   <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', position: 'absolute', top: 3, left: g.pushed ? 17 : 3, transition: "0.2s" }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pushingGroupId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="glass-strong" style={{ width: 400, borderRadius: 16, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>配置推送下发目标</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>推送范围</div>
                <select style={inputStyle} value={form.targetType} onChange={e => setForm(s => ({ ...s, targetType: e.target.value as MessageTargetType }))}>
                  {MESSAGE_TARGETS.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>

              {form.targetType === "role" && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标角色</div>
                  <select style={inputStyle} value={form.targetRole} onChange={e => setForm(s => ({ ...s, targetRole: e.target.value }))}>
                    {PUSHABLE_ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split(" ")[0]}</option>)}
                  </select>
                </div>
              )}

              {form.targetType === "user" && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>目标用户</div>
                  <select style={inputStyle} value={form.targetUserId} onChange={e => setForm(s => ({ ...s, targetUserId: e.target.value }))}>
                    <option value="">请选择用户</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {(u.displayName || u.username)} · {u.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={form.pushAllowEdit} onChange={e => setForm(s => ({ ...s, pushAllowEdit: e.target.checked }))} />
                  允许用户进行编辑
                </label>
                <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4, marginLeft: 21 }}>
                  勾选后，该推送分类的内容即可被接受者自由编辑，开放所有编辑功能。
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="pill-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setPushingGroupId(null)}>取消</button>
                <button className="pill-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={submitPush} disabled={loading}>{loading ? "下发中..." : "确认推送"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


const AdminAudit = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const load = async () => setLogs(await api.admin.audit({ limit: 100 }));
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="admin-head" style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>审计日志</h2>
        <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>操作记录查询，最高展示最近 100 条</div>
      </div>
      <table className="admin-table" style={{ width: "100%", background: "var(--admin-card-bg)", borderRadius: 12, overflow: "hidden" }}>
        <thead style={{ background: "var(--admin-hover-soft)" }}>
          <tr>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>时间</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>操作者</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>行为</th>
            <th style={{ padding: 12, textAlign: "left", fontSize: 13, color: "var(--text-soft)" }}>对象</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} style={{ borderBottom: "1px solid var(--admin-border-slight)" }}>
              <td style={{ padding: 12, fontSize: 12, color: "var(--text-soft)" }} className="mono">{new Date(l.ts).toLocaleString()}</td>
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

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const load = async () => setSettings(await api.admin.settings());
  useEffect(() => { load(); }, []);

  const toggle = async (key: string, val: boolean) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try { await api.admin.patchSettings({ [key]: val }); } catch (e: any) { toast.error("Failed: " + e.message); load(); }
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
      <div className="admin-head" style={{ marginBottom: 30 }}><h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>系统设置</h2><div style={{ fontSize: 13, color: 'var(--text-soft)' }}>控制整个实例的全局行为</div></div>
      <div style={{ background: "var(--admin-card-bg)", borderRadius: 12, padding: "0 24px" }}>
        {rows.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: i === rows.length - 1 ? "none" : '1px solid var(--admin-hover-soft)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.t}</div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>{s.d}</div>
            </div>
            <div onClick={() => toggle(s.key, !settings[s.key])} style={{ display: "inline-block", width: 34, height: 20, borderRadius: 10, background: settings[s.key] ? "var(--ok)" : "var(--admin-border-str)", cursor: "pointer", position: "relative" }}>
               <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', position: 'absolute', top: 3, left: settings[s.key] ? 17 : 3, transition: "0.2s" }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const AdminSSO = () => {
  const [config, setConfig] = useState<{
    enabled: boolean;
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
  } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<{
    enabled?: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string;
  }>({});
  const [showId, setShowId] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = async () => { try { setConfig(await api.admin.sso()); } catch(e) {} };
  useEffect(() => { load(); }, []);

  if (!config) return null;

  const handleEdit = () => {
    setFormData({ ...config, scopes: config.scopes?.join(' ') || '' });
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      await api.admin.patchSso({
        issuer: formData.issuer,
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        redirectUri: formData.redirectUri,
        scopes: (formData.scopes || '').split(' ').filter(Boolean),
      });
      setEditMode(false);
      load();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const inputStyle = {
    background: 'var(--admin-border-soft)',
    border: '1px solid var(--admin-border-str)',
    color: 'var(--text)',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '13px',
    width: '200px',
  };

  return (
    <>
      <div className="admin-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30 }}>
        <div><h2 style={{ fontSize: 24, margin: '0 0 6px 0' }}>SSO 接入配置</h2><div style={{ fontSize: 13, color: 'var(--text-soft)' }}>Casdoor / OIDC 身份源配置 (实时生效)</div></div>
        {editMode ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pill-btn" onClick={() => setEditMode(false)}>取消</button>
            <button className="pill-btn primary" onClick={handleSave}>保存</button>
          </div>
        ) : (
          <button className="pill-btn" onClick={handleEdit}><Icon name="edit" size={12}/> 编辑配置</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        <div className="widget glass-strong" style={{ padding: 24, borderRadius: 16 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 20px 0', borderBottom: '1px solid var(--admin-border-str)', paddingBottom: 10 }}>OIDC 核心连接</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-soft)' }}>Issuer</span>
              {editMode ? <input style={inputStyle} value={formData.issuer} onChange={e=>setFormData({...formData, issuer: e.target.value})} /> : <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right' }}>{config.issuer || "—"}</span>}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-soft)' }}>Client ID</span>
              {editMode ? <input style={inputStyle} value={formData.clientId} onChange={e=>setFormData({...formData, clientId: e.target.value})} /> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right' }}>{showId ? config.clientId : (config.clientId ? "••••••••••••••••" : "—")}</span>
                  {config.clientId && <button onClick={() => setShowId(!showId)} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 0 }}><Icon name={showId ? "eye-off" : "eye"} size={14}/></button>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-soft)' }}>Client Secret</span>
              {editMode ? <input style={inputStyle} value={formData.clientSecret} onChange={e=>setFormData({...formData, clientSecret: e.target.value})} /> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right' }}>{showSecret ? (config.clientSecret || "—") : (config.clientSecret ? "••••••••••••••••" : "—")}</span>
                  {config.clientSecret && <button onClick={() => setShowSecret(!showSecret)} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 0 }}><Icon name={showSecret ? "eye-off" : "eye"} size={14}/></button>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-soft)' }}>Redirect URI</span>
              {editMode ? <input style={inputStyle} value={formData.redirectUri} onChange={e=>setFormData({...formData, redirectUri: e.target.value})} /> : <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right' }}>{config.redirectUri || "—"}</span>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-soft)' }}>Scope</span>
              {editMode ? <input style={inputStyle} value={formData.scopes} onChange={e=>setFormData({...formData, scopes: e.target.value})} /> : <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right' }}>{config.scopes?.join(' ') || "—"}</span>}
            </div>
          </div>
        </div>
        <div className="widget glass-strong" style={{ padding: 24, borderRadius: 16 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 20px 0', borderBottom: '1px solid var(--admin-border-str)', paddingBottom: 10 }}>认证配置状态</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><b style={{ fontSize: 14 }}>Casdoor OIDC</b><div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>全局主身份验证</div></div>
              <div onClick={async () => { await api.admin.patchSso({ enabled: !config.enabled }); load(); }} style={{ width: 34, height: 20, borderRadius: 10, background: config.enabled ? 'var(--ok)' : 'var(--admin-border-str)', cursor: "pointer", position: 'relative' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', position: 'absolute', top: 3, left: config.enabled ? 17 : 3, transition: '0.2s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5 }}>
              <div><b style={{ fontSize: 14 }}>本地账号密码</b><div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>应急超级管理员验证</div></div>
              <div style={{ width: 34, height: 20, borderRadius: 10, background: 'var(--ok)', position: 'relative' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', position: 'absolute', top: 3, left: 17 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

