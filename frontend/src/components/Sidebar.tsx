import React, { useState } from "react";
import { GroupView, Me } from "../types";
import { Icon } from "./Icon";

export const Sidebar = ({
  groups,
  activeGroup,
  setActiveGroup,
  user,
  onAvatar,
  sidebarMode,
  onContext,
  onSideContext,
  onAddCategory,
  onReorderGroup,
  onDropItemToGroup,
}: {
  groups: GroupView[];
  activeGroup: string;
  setActiveGroup: (id: string) => void;
  user: Me | null;
  onAvatar: () => void;
  sidebarMode: "pinned" | "autohide" | "hidden";
  onContext?: (e: React.MouseEvent, id: string) => void;
  onSideContext?: (e: React.MouseEvent) => void;
  onAddCategory: () => void;
  onReorderGroup: (old: string, to: string) => void;
  onDropItemToGroup?: (itemType: string, itemId: string, groupId: string) => void;
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCategory, setHoverCategory] = useState<string | null>(null);
  const hoverTimerRef = React.useRef<number | null>(null);

  const clearHoverTimer = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  if (sidebarMode === "hidden") return null;
  const cls = "sidebar glass" + (sidebarMode === "autohide" ? " auto-hide" : "");

  const isGuest = user === null;
  const label = isGuest
    ? "登录"
    : user!.displayName || user!.username;
  const initials = isGuest
    ? "访"
    : (user!.displayName || user!.username).substring(0, 2).toUpperCase();

  return (
    <aside
      className={cls}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) onSideContext?.(e);
      }}
    >
      <div className="sidebar-top">
        {groups.map((g) => (
          <button
            key={g.id}
            data-group-id={g.id}
            className={"side-btn cat " + (activeGroup === g.id ? "active" : "") + (hoverCategory === g.id ? " hover-target" : "")}
            draggable={!isGuest}
            onDragStart={() => {
              if (!isGuest) setDragId(g.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId) return; // Reordering group, no hover jump
              if (hoverCategory !== g.id) {
                setHoverCategory(g.id);
                clearHoverTimer();
                hoverTimerRef.current = window.setTimeout(() => {
                  setActiveGroup(g.id);
                  hoverTimerRef.current = null;
                }, 500);
              }
            }}
            onDragLeave={() => {
              if (hoverCategory === g.id) {
                setHoverCategory(null);
                clearHoverTimer();
              }
            }}
            onDrop={(e) => {
              clearHoverTimer();
              setHoverCategory(null);
              if (dragId) {
                if (!isGuest && dragId !== g.id) onReorderGroup(dragId, g.id);
              } else {
                try {
                  const data = JSON.parse(e.dataTransfer.getData('application/x-navhub-item') || '{}');
                  if (data.id && data.type && onDropItemToGroup && data.groupId !== g.id) {
                    onDropItemToGroup(data.type, data.id, g.id);
                    // 用户可能在 500ms hover 自动切换前就松手，这里兜底切到目标分类
                    if (activeGroup !== g.id) setActiveGroup(g.id);
                    // 接收反馈
                    e.currentTarget.classList.add("group-receive-pulse");
                    window.setTimeout(() => e.currentTarget?.classList.remove("group-receive-pulse"), 520);
                  }
                } catch (err) {}
              }
              setDragId(null);
            }}
            onClick={() => setActiveGroup(g.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isGuest) onContext?.(e, g.id);
            }}
          >
            <Icon name={g.icon || "grid"} size={18} />
            <span className="side-tip">{g.name}</span>
          </button>

        ))}
        {!isGuest ? (
          <button className="side-btn add-cat" onClick={onAddCategory}>
            <Icon name="plus" size={18} />
            <span className="side-tip">新建分组</span>
          </button>
        ) : null}
      </div>
      <div className="sidebar-bottom">
        <button
          className="side-btn avatar-btn"
          onClick={onAvatar}
          title={isGuest ? "点击登录" : label}
        >
          {!isGuest && user!.avatarUrl ? (
            <div className="side-avatar">
              <img
                src={user!.avatarUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
                alt=""
              />
            </div>
          ) : (
            <div
              className="side-avatar"
              style={{
                background: isGuest
                  ? "linear-gradient(135deg,#6b7280,#374151)"
                  : "linear-gradient(135deg,#ffd7a5,#c98a68)",
                color: "#fff",
              }}
            >
              {initials}
            </div>
          )}
          <span className="side-tip">{label}</span>
        </button>
      </div>
    </aside>
  );
};
