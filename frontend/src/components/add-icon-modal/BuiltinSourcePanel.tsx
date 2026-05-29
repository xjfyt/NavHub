import { Icon } from "../Icon";
import { BUILTIN_ICON_OPTIONS } from "./constants";
import type { BuiltinIconName } from "./types";

interface BuiltinSourcePanelProps {
  builtinIcon: BuiltinIconName;
  onSelectBuiltinIcon: (name: BuiltinIconName) => void;
}

export function BuiltinSourcePanel({
  builtinIcon,
  onSelectBuiltinIcon,
}: BuiltinSourcePanelProps) {
  return (
    <div
      className="builtin-grid"
      style={{ gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}
    >
      {BUILTIN_ICON_OPTIONS.map((ic) => (
        <div
          key={ic}
          className={"builtin-opt " + (builtinIcon === ic ? "active" : "")}
          onClick={() => onSelectBuiltinIcon(ic)}
          title={ic}
          style={{
            background:
              builtinIcon === ic ? "var(--accent)" : "var(--panel-bg)",
            borderColor: "var(--border-color)",
            width: 36,
            height: 36,
            borderRadius: 10,
          }}
        >
          <Icon
            name={ic}
            size={16}
            color={builtinIcon === ic ? "#1a1a1a" : "var(--text)"}
          />
        </div>
      ))}
    </div>
  );
}
