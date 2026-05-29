import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Modal } from "../Modal";

export function RenameIconModal({
  id,
  initialName,
  onClose,
  onSuccess,
}: {
  id: string;
  initialName: string;
  onClose: () => void;
  onSuccess: (newName: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await api.admin.updateLibraryIcon(id, name.trim());
      toast.success("修改成功");
      onSuccess(name.trim());
    } catch (err: any) {
      toast.error(err.message || "修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title="重命名图标"
      overlayClassName="wcc-backdrop"
      className="wcc-modal glass"
      contentStyle={{ width: 400, height: 'auto' }}
    >
        <div className="wcc-head">
          <div className="wcc-tabs">
            <span className="active">重命名图标</span>
          </div>
          <button className="modal-close" onClick={onClose} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-soft)'}}>×</button>
        </div>
        <form className="wcc-body" onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rename-icon-name">新名称</label>
            <input id="rename-icon-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="输入图标名称" />
          </div>
          <button type="submit" className="wcc-btn-add" disabled={saving} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            {saving ? "保存中..." : "保存修改"}
          </button>
        </form>
    </Modal>
  );
}
