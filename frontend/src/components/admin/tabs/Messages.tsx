import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { api } from "../../../api";
import { toast } from "sonner";
import { confirmDialog } from "../../Dialogs";
import type {
  AdminMessage,
  AdminUser,
  MessageLevel,
  MessageTargetType,
} from "../../../types";
import {
  MESSAGE_LEVELS,
  MESSAGE_TARGETS,
  PUSHABLE_ROLES,
  levelBadgeStyle,
  messageTargetText,
} from "../shared";

export const AdminMessages = () => {
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
      const [msgRows, userRows] = await Promise.all([
        api.admin.messages(),
        api.admin.users(),
      ]);
      setMessages(msgRows);
      setUsers(userRows);
    } catch (e: any) {
      toast.error("加载失败：" + e.message);
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
        expiresAt: form.expiresAt.trim()
          ? new Date(form.expiresAt).toISOString()
          : null,
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
      toast.error("推送失败：" + e.message);
    }
    setSubmitting(false);
  };

  const remove = async (id: string) => {
    if (
      !(await confirmDialog("删除后用户收件箱里也会消失，继续吗？", undefined, {
        danger: true,
      }))
    )
      return;
    try {
      await api.admin.deleteMessage(id);
      setMessages((rows) => rows.filter((row) => row.id !== id));
    } catch (e: any) {
      toast.error("删除失败：" + e.message);
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
      <div
        className="admin-head"
        style={{
          marginBottom: 30,
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px 0" }}>消息推送</h2>
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            向指定用户、角色或全体用户下发系统通知，用户可在“偏好设置 →
            消息通知”查看。
          </div>
        </div>
        <button className="pill-btn" onClick={load}>
          <Icon name="activity" size={12} /> 刷新
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 440px) minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div
          className="widget glass-strong"
          style={{ padding: 20, borderRadius: 16 }}
        >
          <h3 style={{ fontSize: 16, margin: "0 0 18px 0" }}>新建推送</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 6,
                }}
              >
                消息标题
              </div>
              <input
                style={inputStyle}
                value={form.title}
                onChange={(e) =>
                  setForm((s) => ({ ...s, title: e.target.value }))
                }
                placeholder="例如：今晚 22:00 维护升级"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 6,
                }}
              >
                消息内容
              </div>
              <textarea
                style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                value={form.content}
                onChange={(e) =>
                  setForm((s) => ({ ...s, content: e.target.value }))
                }
                placeholder="请输入要推送给用户的正文。"
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  级别
                </div>
                <select
                  style={inputStyle}
                  value={form.level}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      level: e.target.value as MessageLevel,
                    }))
                  }
                >
                  {MESSAGE_LEVELS.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  推送范围
                </div>
                <select
                  style={inputStyle}
                  value={form.targetType}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      targetType: e.target.value as MessageTargetType,
                    }))
                  }
                >
                  {MESSAGE_TARGETS.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.targetType === "role" && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  目标角色
                </div>
                <select
                  style={inputStyle}
                  value={form.targetRole}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, targetRole: e.target.value }))
                  }
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
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginBottom: 6,
                  }}
                >
                  目标用户
                </div>
                <select
                  style={inputStyle}
                  value={form.targetUserId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, targetUserId: e.target.value }))
                  }
                >
                  <option value="">请选择用户</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.username} · {u.role}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 6,
                }}
              >
                附带链接
              </div>
              <input
                style={inputStyle}
                value={form.linkUrl}
                onChange={(e) =>
                  setForm((s) => ({ ...s, linkUrl: e.target.value }))
                }
                placeholder="https://example.com/changelog"
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 6,
                }}
              >
                过期时间 (可选)
              </div>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((s) => ({ ...s, expiresAt: e.target.value }))
                }
              />
            </div>

            <button
              className="pill-btn primary"
              onClick={submit}
              disabled={submitting}
              style={{
                justifyContent: "center",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              <Icon name="send" size={12} />{" "}
              {submitting ? "发送中..." : "立即推送"}
            </button>
          </div>
        </div>

        <div
          className="widget glass-strong"
          style={{
            padding: 20,
            borderRadius: 16,
            minHeight: 420,
            opacity: loading ? 0.7 : 1,
          }}
        >
          <h3 style={{ fontSize: 16, margin: "0 0 18px 0" }}>推送历史</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {messages.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-soft)",
                }}
              >
                暂无推送记录
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    border: "1px solid var(--admin-border-slight)",
                    borderRadius: 14,
                    padding: 16,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            ...levelBadgeStyle(msg.level),
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                          }}
                        >
                          {MESSAGE_LEVELS.find((it) => it.id === msg.level)
                            ?.name || msg.level}
                        </span>
                        <span
                          style={{ fontSize: 12, color: "var(--text-soft)" }}
                        >
                          {messageTargetText(msg)}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>
                        {msg.title}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-soft)",
                          marginTop: 8,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.content}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          flexWrap: "wrap",
                          marginTop: 10,
                          fontSize: 11,
                          color: "var(--text-mute)",
                        }}
                      >
                        <span>{new Date(msg.createdAt).toLocaleString()}</span>
                        <span>发布者：{msg.createdByName || "系统"}</span>
                        {msg.expiresAt && (
                          <span>
                            过期时间：{new Date(msg.expiresAt).toLocaleString()}
                          </span>
                        )}
                        {msg.linkUrl ? (
                          <a
                            href={msg.linkUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent)" }}
                          >
                            附带链接
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="pill-btn"
                      onClick={() => remove(msg.id)}
                      style={{ color: "#ffb3b3" }}
                    >
                      <Icon name="trash" size={12} /> 删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminMessages;
