import { useEffect, useState } from "react";
import type { WidgetProps } from "./types";
import { useWidgetConfig } from "../hooks/useWidgetConfig";

interface NotesConfig {
  text: string;
}

const DEFAULTS: NotesConfig = { text: "" };

export const NotesWidget = ({ w }: WidgetProps<NotesConfig> = {}) => {
  const { config, update, saving, savedAt, saveError } =
    useWidgetConfig<NotesConfig>(w, DEFAULTS);
  const [indicator, setIndicator] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  useEffect(() => {
    if (saving) {
      setIndicator("saving");
      return;
    }
    if (savedAt) {
      setIndicator("saved");
      const id = window.setTimeout(() => setIndicator("idle"), 1500);
      return () => window.clearTimeout(id);
    }
  }, [saving, savedAt]);

  // UX-16: 自动保存失败时显式提示「保存失败」,不再静默。
  const hint = saveError
    ? "保存失败"
    : indicator === "saving"
      ? "SAVING…"
      : indicator === "saved"
        ? "SAVED"
        : "AUTOSAVE";
  return (
    <div className="widget w-notes">
      <div className="widget-header">
        <span className="widget-title">便签</span>
        <span
          className="muted mono"
          style={{ fontSize: 10, color: saveError ? "#ff6b6b" : undefined }}
        >
          {hint}
        </span>
      </div>
      <textarea
        value={config.text}
        onChange={(e) => update({ text: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="写点什么..."
        readOnly={w?.readOnly}
      />
    </div>
  );
};

export const NotesDetail = ({ w }: WidgetProps<NotesConfig> = {}) => {
  const { config, update, saving, savedAt, saveError } =
    useWidgetConfig<NotesConfig>(w, DEFAULTS);
  const words = (config.text || "").length;
  const state = saveError
    ? "保存失败"
    : saving
      ? "保存中…"
      : savedAt
        ? "已保存"
        : "自动保存";
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <textarea
        value={config.text}
        onChange={(e) => update({ text: e.target.value })}
        placeholder="写点什么..."
        readOnly={w?.readOnly}
        style={{
          width: "100%",
          minHeight: 360,
          padding: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          color: "inherit",
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      <div
        className="muted"
        style={{
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{words} 字</span>
        <span>{state}</span>
      </div>
    </div>
  );
};
