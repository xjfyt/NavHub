import { Icon } from "../Icon";
import { SOURCE_OPTIONS } from "./constants";
import type { IconSourceMode } from "./types";

interface SourceSelectorProps {
  sourceMode: IconSourceMode;
  onSourceModeChange: (mode: IconSourceMode) => void;
}

export function SourceSelector({
  sourceMode,
  onSourceModeChange,
}: SourceSelectorProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "8px",
        marginBottom: "24px",
      }}
    >
      {SOURCE_OPTIONS.map((opt) => (
        <div
          key={opt.id}
          className={"source-opt " + (sourceMode === opt.id ? "active" : "")}
          onClick={() => onSourceModeChange(opt.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "14px 0",
            borderRadius: "12px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <Icon name={opt.icon} size={20} />
          <span style={{ fontSize: "13px", fontWeight: 500 }}>{opt.name}</span>
        </div>
      ))}
    </div>
  );
}
