import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "./Modal";

interface DialogProps {
  title?: string;
  message: string;
  type: "confirm" | "prompt";
  defaultValue?: string;
  /** UX-28: confirm 危险变体,确认按钮渲染为红色实心。 */
  danger?: boolean;
  onClose: (result: any) => void;
}

const DialogComponent = ({
  title,
  message,
  type,
  defaultValue,
  danger,
  onClose,
}: DialogProps) => {
  const [val, setVal] = useState(defaultValue || "");

  // 取消 / Esc 的返回值:prompt 返回 null,confirm 返回 false。
  const cancelResult = type === "prompt" ? null : false;
  // 确认 / Enter 的返回值:prompt 返回当前输入,confirm 返回 true。
  const submit = () => onClose(type === "prompt" ? val : true);

  // UX-28: 危险变体只作用于 confirm 的主按钮。
  const confirmBtnClass =
    "pill-btn primary" + (type === "confirm" && danger ? " danger" : "");

  return (
    <Modal
      onClose={() => onClose(cancelResult)}
      labelledById="app-dialog-title"
      overlayClassName="modal-overlay"
      overlayStyle={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      className="modal-content glass-strong"
      contentStyle={{
        width: 400,
        padding: 24,
        borderRadius: 16,
        background: "var(--glass-bg-strong)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
      }}
      contentProps={{
        // UX-28: confirm 没有输入框,在对话框层面捕获 Enter 直接确认;
        // (prompt 的 Enter 由输入框自身处理,避免重复触发。)
        onKeyDown: (e: ReactKeyboardEvent) => {
          if (type === "confirm" && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        },
      }}
    >
      <h3 id="app-dialog-title" style={{ margin: "0 0 16px 0", fontSize: 18 }}>
        {title || (type === "confirm" ? "确认" : "输入")}
      </h3>
      <div
        style={{
          fontSize: 13,
          marginBottom: 16,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}
      >
        {message}
      </div>

      {type === "prompt" && (
        <input
          autoFocus
          className="wcc-input"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--panel-border)",
            background: "rgba(0,0,0,0.1)",
            color: "var(--text)",
            borderRadius: 8,
            fontSize: 14,
            outline: "none",
            marginBottom: 20,
          }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onClose(val);
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: type === "confirm" ? 20 : 0,
        }}
      >
        <button className="pill-btn" onClick={() => onClose(cancelResult)}>
          取消
        </button>
        {type === "confirm" ? (
          // autoFocus 让确认按钮成为初始焦点,Enter 自然触发它。
          <button autoFocus className={confirmBtnClass} onClick={submit}>
            确认
          </button>
        ) : (
          <button className="pill-btn primary" onClick={submit}>
            确定
          </button>
        )}
      </div>
    </Modal>
  );
};

export const confirmDialog = (
  message: string,
  title?: string,
  opts?: { danger?: boolean },
): Promise<boolean> => {
  return new Promise((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    const cleanup = (result: boolean) => {
      root.unmount();
      div.remove();
      resolve(result);
    };
    root.render(
      <DialogComponent
        type="confirm"
        message={message}
        title={title}
        danger={opts?.danger}
        onClose={cleanup}
      />,
    );
  });
};

export const promptDialog = (
  message: string,
  defaultValue?: string,
  title?: string,
): Promise<string | null> => {
  return new Promise((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    const cleanup = (result: string | null) => {
      root.unmount();
      div.remove();
      resolve(result);
    };
    root.render(
      <DialogComponent
        type="prompt"
        message={message}
        defaultValue={defaultValue}
        title={title}
        onClose={cleanup}
      />,
    );
  });
};
