import { useState } from "react";
import { Icon } from "./Icon";

// 6 列 × 5 行 = 30 个，覆盖常见场景：办公 / 学习 / 娱乐 / 通讯 / 资源 / 角色
const SIDE_ICONS = [
  "home", "briefcase", "tool", "code", "grid", "settings",
  "star", "heart", "book", "globe", "shield", "user",
  "users", "music", "video", "camera", "image", "play",
  "mail", "message", "phone", "bell", "cloud", "download",
  "file", "folder", "cart", "wallet", "gamepad", "mascot",
];

export function AddCategoryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: { name: string; icon: string }) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("grid");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <div className="modal-head">
          <div>
            <h2>新建分组</h2>
            <div className="sub">选择名称与图标</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
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
            type="button"
            className="pill-btn primary"
            onClick={() => name.trim() && onSave({ name: name.trim(), icon })}
          >
            <Icon name="check" size={14} />
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
