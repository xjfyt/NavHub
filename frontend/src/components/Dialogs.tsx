import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

interface DialogProps {
  title?: string;
  message: string;
  type: "confirm" | "prompt";
  defaultValue?: string;
  onClose: (result: any) => void;
}

const DialogComponent = ({ title, message, type, defaultValue, onClose }: DialogProps) => {
  const [val, setVal] = useState(defaultValue || "");

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(type === "prompt" ? null : false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, type]);

  return (
    <div className="modal-overlay" onMouseDown={() => onClose(type === "prompt" ? null : false)} style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="modal-content glass-strong" onMouseDown={(e) => e.stopPropagation()} style={{ width: 400, padding: 24, borderRadius: 16, background: "var(--glass-bg-strong)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>{title || (type === "confirm" ? "确认" : "输入")}</h3>
        <div style={{ fontSize: 13, marginBottom: 16, color: "var(--text)", whiteSpace: "pre-wrap" }}>
          {message}
        </div>
        
        {type === "prompt" && (
          <input
            autoFocus
            className="wcc-input"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--panel-border)", background: "rgba(0,0,0,0.1)", color: "var(--text)", borderRadius: 8, fontSize: 14, outline: "none", marginBottom: 20 }}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onClose(val);
            }}
          />
        )}
        
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: type === "confirm" ? 20 : 0 }}>
          <button className="pill-btn" onClick={() => onClose(type === "prompt" ? null : false)}>取消</button>
          {type === "confirm" ? (
            <button className="pill-btn primary" onClick={() => onClose(true)}>确认</button>
          ) : (
            <button className="pill-btn primary" onClick={() => onClose(val)}>确定</button>
          )}
        </div>
      </div>
    </div>
  );
};

export const confirmDialog = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    const cleanup = (result: boolean) => {
      root.unmount();
      div.remove();
      resolve(result);
    };
    root.render(<DialogComponent type="confirm" message={message} title={title} onClose={cleanup} />);
  });
};

export const promptDialog = (message: string, defaultValue?: string, title?: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    const cleanup = (result: string | null) => {
      root.unmount();
      div.remove();
      resolve(result);
    };
    root.render(<DialogComponent type="prompt" message={message} defaultValue={defaultValue} title={title} onClose={cleanup} />);
  });
};
