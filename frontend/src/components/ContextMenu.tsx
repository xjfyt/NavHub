import { useEffect, useRef } from "react";
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";
import { rovingIndex } from "../utils/focusTrap";

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();

    // Delay adding the click/contextmenu listeners by a tick
    // to prevent the bubbling event that originally opened the menu
    // from triggering this listener and instantly closing it.
    const timerId = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 10);

    return () => {
      clearTimeout(timerId);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [onClose]);

  // A11Y-5 / UX-25:菜单打开后聚焦第一个 menuitem。
  useEffect(() => {
    const id = window.setTimeout(() => {
      const first = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]',
      );
      first?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // A11Y-5 / UX-25:菜单容器键盘漫游 —— ArrowUp/Down 移动、Home/End 跳转、Esc 关闭。
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    const dirMap: Record<string, "up" | "down" | "home" | "end"> = {
      ArrowDown: "down",
      ArrowUp: "up",
      Home: "home",
      End: "end",
    };
    const dir = dirMap[e.key];
    if (!dir) return;
    e.preventDefault();
    const focusables = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (focusables.length === 0) return;
    const cur = focusables.findIndex((el) => el === document.activeElement);
    const next = rovingIndex(cur, dir, focusables.length);
    focusables[next]?.focus();
  };

  const pos = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - items.length * 42 - 16),
  };

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      role="menu"
      style={pos}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((it, i) => {
        if (it.divider)
          return <div key={i} className="ctx-divider" role="separator" />;
        if (it.kind === "size") {
          const opts = it.sizes ?? SIZES;
          return (
            <div key={i} className="ctx-row" role="group" aria-label="尺寸">
              <span className="ctx-row-lbl">尺寸</span>
              <div className="ctx-row-btns">
                {opts.map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={it.current === sz.id}
                    className={
                      "ctx-size-btn " + (it.current === sz.id ? "active" : "")
                    }
                    title={sz.label}
                    aria-label={`尺寸：${sz.label}`}
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
            <div key={i} className="ctx-row" role="group" aria-label="颜色">
              <span className="ctx-row-lbl">颜色</span>
              <div className="ctx-row-btns swatches">
                {DEFAULT_ICON_COLORS.slice(0, 10).map((c, ci) => (
                  <button
                    key={ci}
                    type="button"
                    role="menuitemradio"
                    aria-checked={it.current === ci}
                    className={
                      "ctx-swatch " + (it.current === ci ? "active" : "")
                    }
                    style={{ background: c.bg }}
                    aria-label={`颜色 ${ci + 1}`}
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
          <button
            key={i}
            type="button"
            role="menuitem"
            className={"ctx-item " + (it.danger ? "danger" : "")}
            onClick={() => {
              it.onClick?.();
              if (!it.keepOpen) onClose();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={14} /> : null}
            <span>{it.label}</span>
            {it.shortcut ? (
              <span className="ctx-short">{it.shortcut}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
