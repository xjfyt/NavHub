import React from "react";
import { Icon } from "./Icon";
import { Me } from "../types";

export const UserMenu = ({
  user,
  onClose,
  onOpenAdmin,
  onOpenSSO,
  onOpenSettings,
  onLogout,
  onContextMenu,
  sidebarPos = "left",
}: {
  user: Me;
  onClose: () => void;
  onOpenAdmin: () => void;
  onOpenSSO: () => void;
  onOpenSettings: (isProfile?: boolean) => void;
  onLogout: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  sidebarPos?: "left" | "right";
}) => {
  const role = user.role || "user";
  const roleLabel = { superadmin: "超级管理员", admin: "管理员", user: "普通用户", guest: "访客" }[role] || role;
  
  let items: any[] = [];
  if (role === "guest") {
    items = [{ icon:"key", label:"登录 / 切换账号", onClick:onOpenSSO }];
  } else if (role === "user") {
    items = [
      { icon:"user", label:"个人信息", onClick:() => onOpenSettings(true) },
      { icon:"settings", label:"偏好设置", onClick:() => onOpenSettings(false) },
      { divider:true },
      { icon:"logout", label:"退出登录", danger:true, onClick:onLogout },
    ];
  } else if (role === "admin" || role === "superadmin") {
    items = [
      { icon:"user", label:"个人信息", onClick:() => onOpenSettings(true) },
      { icon:"settings", label:"偏好设置", onClick:() => onOpenSettings(false) },
      { icon:"shield", label:"管理后台", onClick:onOpenAdmin },
      { divider:true },
      { icon:"logout", label:"退出登录", danger:true, onClick:onLogout },
    ];
  } else {
    items = [
      { icon:"user", label:"个人信息", onClick:() => onOpenSettings(true) },
      { icon:"settings", label:"偏好设置", onClick:() => onOpenSettings(false) },
      { icon:"shield", label:"管理后台", onClick:onOpenAdmin },
      { divider:true },
      { icon:"logout", label:"退出登录", danger:true, onClick:onLogout },
    ];
  }

  return (
    <div className="user-menu-backdrop" onClick={onClose} onContextMenu={(e) => {
      e.preventDefault();
      onClose();
      if (onContextMenu) onContextMenu(e);
    }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
      <div
        className="user-menu glass-strong"
        onClick={e=>e.stopPropagation()}
        onContextMenu={e=>e.stopPropagation()}
        style={
          sidebarPos === "right"
            ? { position: 'absolute', bottom: 70, right: 20, zIndex: 9999 }
            : { position: 'absolute', bottom: 70, left: 20, zIndex: 9999 }
        }
      >
        <div className="user-menu-head">
          {user.avatarUrl ? (
            <div className="side-avatar">
              <img
                src={user.avatarUrl}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                alt=""
              />
            </div>
          ) : (
            <div className="side-avatar" style={{ background: 'linear-gradient(135deg, #ffd7a5, #c98a68)' }}>
              {(user.displayName || user.username).substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize:14, fontWeight:600 }}>{user.displayName || user.username}</div>
            <div style={{ fontSize:11, color:'var(--text-soft)' }}>{user.email || (role==="guest"?"未登录":"")}</div>
            <div style={{ marginTop:4 }}><span className={`role-badge role-${role}`}>{roleLabel}</span></div>
          </div>
        </div>
        <div className="user-menu-items">
          {items.map((it, i) => it.divider ? <div key={i} className="ctx-divider"/> :
            <div key={i} className={"ctx-item "+(it.danger?"danger":"")} onClick={() => { it.onClick && it.onClick(); onClose(); }}>
              <Icon name={it.icon} size={14}/><span>{it.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
