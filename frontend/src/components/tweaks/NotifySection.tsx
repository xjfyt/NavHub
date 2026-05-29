import { api } from "../../api";
import type { UserMessage } from "../../types";
import { Placeholder } from "./shared";

export const NotifySection = ({
  loggedIn,
  messages,
  messagesLoading,
  setMessages,
}: {
  loggedIn: boolean;
  messages: UserMessage[];
  messagesLoading: boolean;
  setMessages: React.Dispatch<React.SetStateAction<UserMessage[]>>;
}) => {
  if (!loggedIn) {
    return (
      <Placeholder
        title="消息通知"
        text="登录后可查看管理员推送给你的系统消息。"
      />
    );
  }

  const unreadCount = messages.filter((msg) => !msg.readAt).length;
  const levelStyle = (level: UserMessage["level"]) => {
    if (level === "success")
      return { background: "rgba(62,190,120,0.16)", color: "#8ee6b8" };
    if (level === "warning")
      return { background: "rgba(255,196,87,0.16)", color: "#ffd778" };
    if (level === "error")
      return { background: "rgba(255,110,110,0.16)", color: "#ff9b9b" };
    return { background: "rgba(120,180,255,0.16)", color: "#8fb8ff" };
  };
  const targetText = (msg: UserMessage) => {
    if (msg.targetType === "all") return "面向全体用户";
    if (msg.targetType === "role")
      return `面向角色：${msg.targetRole || "未知角色"}`;
    return "定向发送给你";
  };

  const markRead = async (id: string) => {
    setMessages((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, readAt: row.readAt || new Date().toISOString() }
          : row,
      ),
    );
    try {
      await api.markMessageRead(id);
    } catch (e) {
      console.error("markMessageRead failed", e);
    }
  };

  const markAllRead = async () => {
    setMessages((rows) =>
      rows.map((row) => ({
        ...row,
        readAt: row.readAt || new Date().toISOString(),
      })),
    );
    try {
      await api.markAllMessagesRead();
    } catch (e) {
      console.error("markAllMessagesRead failed", e);
    }
  };

  return (
    <div className="tw-content">
      <div className="tw-section">
        <div className="tw-section-title">系统消息</div>
        <div
          className="tw-wallpaper-hero"
          style={{ gap: 16, alignItems: "center" }}
        >
          <div style={{ flex: 1 }}>
            <div className="tw-wallpaper-name">
              你有 {unreadCount} 条未读消息
            </div>
            <div className="tw-wallpaper-meta">
              管理员发送的维护通知、公告和定向提醒都会出现在这里。
            </div>
          </div>
          <div className="tw-wallpaper-actions">
            <button
              className="tw-action-btn primary"
              onClick={markAllRead}
              disabled={messages.length === 0}
            >
              全部标为已读
            </button>
          </div>
        </div>
      </div>

      <div className="tw-section">
        <div className="tw-section-title">收件箱</div>
        <div style={{ display: "grid", gap: 12 }}>
          {messagesLoading ? (
            <div className="tw-empty">
              <div className="tw-empty-title">加载中</div>
              <div className="tw-empty-sub">正在拉取最新消息。</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="tw-empty">
              <div className="tw-empty-title">暂无消息</div>
              <div className="tw-empty-sub">管理员推送的公告会显示在这里。</div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  borderRadius: 18,
                  border: msg.readAt
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(255,215,165,0.34)",
                  background: msg.readAt
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(255,215,165,0.08)",
                  padding: 16,
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
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          ...levelStyle(msg.level),
                          padding: "3px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                        }}
                      >
                        {
                          {
                            info: "普通",
                            success: "成功",
                            warning: "提醒",
                            error: "紧急",
                          }[msg.level]
                        }
                      </span>
                      {!msg.readAt ? (
                        <span className="tw-wallpaper-tag">未读</span>
                      ) : null}
                      <span style={{ fontSize: 11, color: "var(--text-mute)" }}>
                        {targetText(msg)}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {msg.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-soft)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        marginTop: 8,
                      }}
                    >
                      {msg.content}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        marginTop: 10,
                        fontSize: 11,
                        color: "var(--text-mute)",
                      }}
                    >
                      <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      <span>发布者：{msg.createdByName || "系统"}</span>
                    </div>
                  </div>
                  {!msg.readAt ? (
                    <button
                      className="tw-action-btn"
                      onClick={() => markRead(msg.id)}
                    >
                      标为已读
                    </button>
                  ) : null}
                </div>
                {msg.linkUrl ? (
                  <div style={{ marginTop: 12 }}>
                    <a
                      className="tw-action-btn link"
                      href={msg.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开附带链接
                    </a>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
