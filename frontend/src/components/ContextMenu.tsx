import { useEffect } from "react";
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";

export interface CtxItem {
  divider?: boolean;
  kind?: "size" | "color";
  icon?: string;
  label?: string;
  shortcut?: string;
  danger?: boolean;
  onClick?: () => void;
  /** 点击后保持菜单打开(用于打开子菜单场景) */
  keepOpen?: boolean;
  current?: string | number;
  onPick?: (value: string | number) => void;
  /** Override the size options shown for kind="size" (e.g. folder uses different ordering) */
  sizes?: { id: string; label: string }[];
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxItem[];
}

const SIZES: { id: "sq" | "pill-size" | "lg"; label: string }[] = [
  { id: "sq", label: "小" },
  { id: "pill-size", label: "中" },
  { id: "lg", label: "大" },
];

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    
    // Delay adding the click/contextmenu listeners by a tick
    // to prevent the bubbling event that originally opened the menu
    // from triggering this listener and instantly closing it.
    const timerId = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 10);
    
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pos = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - items.length * 42 - 16),
  };

  return (
    <div
      className="ctx-menu"
      style={pos}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((it, i) => {
        if (it.divider) return <div key={i} className="ctx-divider" />;
        if (it.kind === "size") {
          const opts = it.sizes ?? SIZES;
          return (
            <div key={i} className="ctx-row">
              <span className="ctx-row-lbl">尺寸</span>
              <div className="ctx-row-btns">
                {opts.map((sz) => (
                  <button
                    key={sz.id}
                    className={
                      "ctx-size-btn " + (it.current === sz.id ? "active" : "")
                    }
                    title={sz.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      it.onPick?.(sz.id);
                      onClose();
                    }}
                  >
                    <div className={"ctx-size-preview " + sz.id} />
                    <span>{sz.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (it.kind === "color") {
          return (
            <div key={i} className="ctx-row">
              <span className="ctx-row-lbl">颜色</span>
              <div className="ctx-row-btns swatches">
                {DEFAULT_ICON_COLORS.slice(0, 10).map((c, ci) => (
                  <button
                    key={ci}
                    className={
                      "ctx-swatch " + (it.current === ci ? "active" : "")
                    }
                    style={{ background: c.bg }}
                    onClick={(e) => {
                      e.stopPropagation();
                      it.onPick?.(ci);
                      onClose();
                    }}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={"ctx-item " + (it.danger ? "danger" : "")}
            onClick={() => {
              it.onClick?.();
              if (!it.keepOpen) onClose();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={14} /> : null}
            <span>{it.label}</span>
            {it.shortcut ? <span className="ctx-short">{it.shortcut}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
