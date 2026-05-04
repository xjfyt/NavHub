import React from "react";
import { Icon } from "./Icon";
import { useWorkspace } from "../hooks/useWorkspace";

import { api } from "../api";
import { toast } from "sonner";

export const ProfileModal = ({ onClose }: { onClose: () => void }) => {
  const { me, updateMe } = useWorkspace();
  const [uploading, setUploading] = React.useState(false);
  
  if (!me) return null;

  const role = me.role || "user";
  const roleMap: Record<string, string> = { superadmin: "超级管理员", admin: "管理员", user: "普通用户", guest: "访客" };
  const roleLabel = roleMap[role] || role;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.upload(file, 'avatar');
      const url = new URL(res.url, window.location.origin).toString();
      await updateMe({ avatarUrl: url });
      toast.success("头像更新成功");
    } catch (err: any) {
      toast.error("头像上传失败：" + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <div className="tweaks-backdrop" onClick={onClose} style={{ zIndex: 10000 }} />
      <div className="modal glass-strong" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10001, padding: '36px 30px', width: 340, borderRadius: 24, color: 'var(--text)', boxShadow: '0 24px 48px rgba(0,0,0,0.2), inset 0 1px 0 var(--glass-border-soft)' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 20, top: 20, opacity: 0.5, background: 'var(--glass-bg)', border: '1px solid var(--glass-border-soft)', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <Icon name="close" size={14} />
        </button>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', display: 'inline-block', position: 'relative' }}>
            <div className="side-avatar" style={{ 
              background: 'linear-gradient(135deg, var(--glass-bg-strong) 0%, var(--glass-bg) 100%)', 
              border: '1px solid var(--glass-border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15), inset 0 1px 1px var(--glass-border-soft)',
              width: 86, height: 86, fontSize: 36, fontWeight: 700, margin: '0 auto 16px', color: 'var(--text)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
              overflow: 'hidden'
            }}>
              {me.avatarUrl ? (
                <img src={me.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />
              ) : (
                (me.displayName || me.username).substring(0, 2).toUpperCase()
              )}
            </div>
            {uploading && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 'calc(100% - 16px)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Icon name="activity" size={24} />
              </div>
            )}
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              disabled={uploading}
              onChange={handleAvatarUpload}
            />
          </label>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{me.displayName || me.username}</h2>
          <div style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 16 }}>{me.email || "未绑定邮箱"}</div>
          <span className={`role-badge role-${role}`} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20 }}>{roleLabel}</span>
        </div>
        
        <div style={{ background: 'var(--glass-bg)', padding: 18, borderRadius: 16, border: '1px solid var(--glass-border-soft)', boxShadow: 'inset 0 1px 0 var(--glass-border-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-mute)' }}>账户状态</span>
            <span style={{ color: 'var(--ok)', fontWeight: 600, background: 'rgba(62,190,120,0.15)', padding: '4px 10px', borderRadius: 8 }}>活跃</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-mute)' }}>认证方式</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{me.id === "guest" ? "无" : "Casdoor SSO"}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-mute)' }}>最近登录</span>
            <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>今天</span>
          </div>
        </div>
      </div>
    </>
  );
};
