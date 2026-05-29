import type { IconSize, IconView } from "../../types";
import { DEFAULT_ICON_COLORS } from "../../constants/design";
import { IconTile } from "../IconTile";
import { SIZE_OPTIONS } from "./constants";

interface PreviewPanelProps {
  preview: IconView;
  size: IconSize;
  onSizeChange: (size: IconSize) => void;
  color: number;
  onColorChange: (color: number) => void;
  letter: string;
  onLetterChange: (letter: string) => void;
}

export function PreviewPanel({
  preview,
  size,
  onSizeChange,
  color,
  onColorChange,
  letter,
  onLetterChange,
}: PreviewPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "var(--glass-bg-strong)",
          borderRadius: "24px",
          padding: "28px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          border: "1px solid var(--border-color)",
          position: "relative",
        }}
      >
        <div style={{ transform: "scale(1.1)", transformOrigin: "center" }}>
          <IconTile icon={preview} />
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "8px",
            width: "100%",
          }}
        >
          {SIZE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSizeChange(o.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 4px",
                background: size === o.id ? "var(--panel-bg)" : "transparent",
                border:
                  "1px solid " +
                  (size === o.id ? "var(--glass-border)" : "transparent"),
                borderRadius: "12px",
                color: size === o.id ? "var(--text)" : "var(--text-soft)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 24,
                }}
              >
                <div
                  style={{
                    width: o.id === "lg" ? 20 : o.id === "pill-size" ? 24 : 16,
                    height: o.id === "lg" ? 20 : 16,
                    borderRadius:
                      o.id === "circle-size"
                        ? "50%"
                        : o.id === "pill-size"
                          ? "8px"
                          : "4px",
                    background:
                      size === o.id ? "var(--text)" : "var(--text-mute)",
                    opacity: size === o.id ? 0.8 : 0.5,
                    transition: "all 0.2s",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {o.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>主题色 Color</label>
        <div
          className="color-picker"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 28px)",
            gap: "10px",
          }}
        >
          {DEFAULT_ICON_COLORS.map((c, i) => (
            <div
              key={i}
              className={"color-swatch " + (color === i ? "active" : "")}
              style={{
                background: c.bg,
                width: 28,
                height: 28,
                borderRadius: "50%",
                boxShadow:
                  color === i
                    ? "0 0 0 2px var(--glass-bg-strong), 0 0 0 4px var(--text)"
                    : "0 2px 8px rgba(0,0,0,0.2)",
                border: "none",
                transition: "all 200ms",
              }}
              onClick={() => onColorChange(i)}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="ai-letter">回退字符 Letter</label>
        <input
          id="ai-letter"
          maxLength={3}
          value={letter}
          onChange={(e) => onLetterChange(e.target.value)}
          placeholder="未获取图标时展示"
        />
      </div>
    </div>
  );
}
