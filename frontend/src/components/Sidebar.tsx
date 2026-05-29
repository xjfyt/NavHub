import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { GroupView, Me } from "../types";
import { Icon } from "./Icon";
import { groupDroppableId } from "../utils/dragTarget";

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
  dndActiveItemId = null,
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
  /**
   * UX-27：当前是否有图标/组件正被 @dnd-kit 拖拽(来自 Shell 的 useNavDnd)。
   * 非 null 时，分类按钮作为 @dnd-kit droppable 亮起，提示「可拖到这里移动到该分类」。
   */
  dndActiveItemId?: string | null;
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
          <CategoryButton
            key={g.id}
            group={g}
            active={activeGroup === g.id}
            isGuest={isGuest}
            hover={hoverCategory === g.id}
            // 当前正被 @dnd-kit 拖拽的元素不在本分类时，本按钮才作为可投放目标亮起。
            dndDropActive={dndActiveItemId !== null}
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
                } catch {}
              }
              setDragId(null);
            }}
            onClick={() => setActiveGroup(g.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isGuest) onContext?.(e, g.id);
            }}
          />
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

// 单个分类按钮。同时承担：
//   • 原有的「原生 HTML5 拖拽」——分类重排 + 文件夹内项目拖到分类(application/x-navhub-item)。
//   • UX-27 新增的 @dnd-kit useDroppable —— 接住从网格拖来的图标/组件，松手即跨分类移动。
// 两套拖拽机制互不冲突：原生 DnD 用 drag 事件，@dnd-kit 用 pointer 事件。
const CategoryButton = ({
  group,
  active,
  isGuest,
  hover,
  dndDropActive,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onContextMenu,
}: {
  group: GroupView;
  active: boolean;
  isGuest: boolean;
  hover: boolean;
  dndDropActive: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) => {
  // @dnd-kit droppable —— id 用 "group:<id>" 命名空间(见 utils/dragTarget)。
  const { setNodeRef, isOver } = useDroppable({ id: groupDroppableId(group.id) });
  const showDndTarget = dndDropActive && !active;
  return (
    <button
      ref={setNodeRef}
      data-group-id={group.id}
      className={
        "side-btn cat " +
        (active ? "active" : "") +
        (hover ? " hover-target" : "") +
        (showDndTarget ? " dnd-drop-zone" : "") +
        (showDndTarget && isOver ? " dnd-drop-over" : "")
      }
      draggable={!isGuest}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <Icon name={group.icon || "grid"} size={18} />
      <span className="side-tip">{group.name}</span>
    </button>
  );
};
