import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import type { GroupView } from "../types";

// 6 列 × 5 行 = 30 个，覆盖常见场景：办公 / 学习 / 娱乐 / 通讯 / 资源 / 角色
const SIDE_ICONS = [
  "home", "briefcase", "tool", "code", "grid", "settings",
  "star", "heart", "book", "globe", "shield", "user",
  "users", "music", "video", "camera", "image", "play",
  "mail", "message", "phone", "bell", "cloud", "download",
  "file", "folder", "cart", "wallet", "gamepad", "mascot",
];

export function AddCategoryModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: GroupView;
  onClose: () => void;
  onSave: (body: { name: string; icon: string }) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "grid");

  // UX-29: 表单提交(Enter 或点主按钮)统一走这里,空名称不提交。
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave({ name: name.trim(), icon });
  };

  return (
    <Modal
      onClose={onClose}
      labelledById="add-category-title"
      overlayClassName="modal-backdrop"
      className="modal"
      contentStyle={{ maxWidth: 460 }}
    >
        <div className="modal-head">
          <div>
            <h2 id="add-category-title">{isEdit ? "编辑分组" : "新建分组"}</h2>
            <div className="sub">{isEdit ? "修改名称或图标" : "选择名称与图标"}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} style={{ display: "contents" }}>
        <div className="modal-body">
          <div className="field">
            <label>分组名称</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 学习"
            />
          </div>
          <div className="field">
            <label>图标</label>
            <div className="builtin-grid">
              {SIDE_ICONS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  className={"builtin-opt " + (icon === ic ? "active" : "")}
                  onClick={() => setIcon(ic)}
                  aria-label={ic}
                >
                  <Icon name={ic} size={22} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="pill-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="pill-btn primary"
          >
            <Icon name="check" size={14} />
            {isEdit ? "保存" : "添加"}
          </button>
        </div>
        </form>
    </Modal>
  );
}
