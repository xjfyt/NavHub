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
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: "8px",
        marginBottom: "16px",
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
            padding: "10px 4px",
            borderRadius: "12px",
            cursor: "pointer",
            transition: "all 0.2s",
            minWidth: 0,
          }}
        >
          <Icon name={opt.icon} size={18} />
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {opt.name}
          </span>
        </div>
      ))}
    </div>
  );
}
