import { Component, useState, type ReactNode, type CSSProperties } from "react";
import { ROLES } from "../../constants/design";
import type { AdminMessage, MessageLevel, MessageTargetType } from "../../types";

export const MESSAGE_LEVELS: { id: MessageLevel; name: string }[] = [
  { id: "info", name: "普通" },
  { id: "success", name: "成功" },
  { id: "warning", name: "提醒" },
  { id: "error", name: "紧急" },
];

export const MESSAGE_TARGETS: { id: MessageTargetType; name: string }[] = [
  { id: "role", name: "按角色" },
  { id: "user", name: "指定用户" },
  { id: "all", name: "全体用户" },
];

export const PUSHABLE_ROLES = ROLES.filter((r) => r.id !== "guest");

export const levelBadgeStyle = (level: MessageLevel): CSSProperties => {
  if (level === "success") return { background: "rgba(62, 190, 120, 0.16)", color: "#8ee6b8" };
  if (level === "warning") return { background: "rgba(255, 196, 87, 0.16)", color: "#ffd778" };
  if (level === "error") return { background: "rgba(255, 110, 110, 0.16)", color: "#ff9b9b" };
  return { background: "rgba(120, 180, 255, 0.16)", color: "#8fb8ff" };
};

export const messageTargetText = (
  msg: Pick<AdminMessage, "targetType" | "targetRole" | "targetUserName">,
) => {
  if (msg.targetType === "all") return "全体登录用户";
  if (msg.targetType === "role") {
    return `角色 · ${ROLES.find((r) => r.id === msg.targetRole)?.label.split(" ")[0] || msg.targetRole}`;
  }
  return `用户 · ${msg.targetUserName || "指定用户"}`;
};

export const AdminUserAvatar = ({
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

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "red", background: "#fee" }}>
          <h3>Admin Panel Crash</h3>
          <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
