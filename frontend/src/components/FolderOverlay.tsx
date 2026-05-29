import React, { useEffect, useState } from "react";
import { IconView } from "../types";
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";
import { parseBuiltinIconUrl, safeHttpUrl } from "../utils/iconSources";
import { useAutoAnimate } from "@formkit/auto-animate/react";

export const FolderOverlay = ({
  folder,
  onClose,
  onExtract,
  onRename,
  onReorder,
  onItemContext,
}: {
  folder: IconView;
  onClose: () => void;
  onExtract?: (itemId: string) => void;
  onRename?: (newName: string) => void;
  onReorder?: (order: string[]) => void;
  onItemContext?: (
    e: React.MouseEvent,
    item: import("../types").FolderItemView,
  ) => void;
}) => {
  const [anim, setAnim] = useState(false);
  const outTimerRef = React.useRef<number | null>(null);
  const swapLockRef = React.useRef<number>(0);
  const lastSwapSourceRef = React.useRef<string | null>(null);
  const lastSwapTargetRef = React.useRef<string | null>(null);
  const [gridRef] = useAutoAnimate<HTMLDivElement>({
    duration: 250,
    easing: "ease-in-out",
  });

  const [dragId, setDragId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState(folder.folderItems || []);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(folder.name || "");
  const initialOrderRef = React.useRef<string>(
    (folder.folderItems || []).map((i) => i.id).join(","),
  );

  useEffect(() => {
    setLocalItems(folder.folderItems || []);
    initialOrderRef.current = (folder.folderItems || [])
      .map((i) => i.id)
      .join(",");
  }, [folder.folderItems]);

  useEffect(() => {
    requestAnimationFrame(() => setAnim(true));
  }, []);

  const close = () => {
    setAnim(false);
    setTimeout(onClose, 250);
  };

  const clearOutTimer = () => {
    if (outTimerRef.current) {
      window.clearTimeout(outTimerRef.current);
      outTimerRef.current = null;
    }
  };

  const renderGlyph = (item: any) => {
    const builtin = parseBuiltinIconUrl(item.imageUrl);
    const plain = !!item.imageUrl && (item.imageStyle || "plain") === "plain";
    const shapeClass =
      item.imageRadius === "square" ? "radius-square" : "radius-rounded";
    if (builtin) {
      return (
        <span
          className={"tile-image-glyph " + shapeClass + (plain ? " plain" : "")}
        >
          <Icon name={builtin} size="100%" stroke={1.8} />
        </span>
      );
    }
    if (item.imageUrl) {
      return (
        <img
          className={
            "tile-image " + shapeClass + (plain ? " plain" : " framed")
          }
          src={item.imageUrl}
          draggable={false}
          alt={item.name || ""}
        />
      );
    }
    return item.letter || item.name?.[0] || "?";
  };

  return (
    <div
      className={"folder-overlay " + (anim ? "open" : "")}
      onClick={close}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!outTimerRef.current) {
          outTimerRef.current = window.setTimeout(() => {
            close();
          }, 200);
        }
      }}
      onDragLeave={clearOutTimer}
      onDrop={(e) => {
        clearOutTimer();
        const id = e.dataTransfer.getData("application/x-folder-item");
        if (id && onExtract) {
          onExtract(id);
          close();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: anim ? 1 : 0,
        transition: "opacity 250ms ease",
      }}
    >
      <div
        className="folder-overlay-content"
        onClick={(e) => e.stopPropagation()}
        onDrop={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          clearOutTimer(); // cancel closing if dragged back in
        }}
        style={{
          width: "min(90vw, 420px)",
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(20px) saturate(150%)",
          borderRadius: "32px",
          padding: "28px 24px",
          boxShadow:
            "0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1) inset",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          transform: anim ? "scale(1)" : "scale(0.95)",
          transition: "transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--text)",
            textShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        >
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => {
                setEditingName(false);
                if (onRename && nameValue.trim() !== folder.name)
                  onRename(nameValue.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditingName(false);
                  if (onRename && nameValue.trim() !== folder.name)
                    onRename(nameValue.trim());
                } else if (e.key === "Escape") {
                  // UX-23:Esc 取消内联重命名,恢复原名且不触发保存
                  e.stopPropagation();
                  setNameValue(folder.name || "");
                  setEditingName(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="文件夹名称"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px dashed rgba(255,255,255,0.4)",
                color: "var(--text)",
                fontSize: "20px",
                fontWeight: 600,
                textAlign: "center",
                outline: "none",
                width: "100%",
                maxWidth: "200px",
              }}
            />
          ) : (
            <>
              <span
                onClick={(e) => {
                  if (onRename) {
                    e.stopPropagation();
                    setNameValue(folder.name || "");
                    setEditingName(true);
                  }
                }}
                style={{ cursor: onRename ? "pointer" : "default" }}
                title={onRename ? "重命名" : undefined}
              >
                {folder.name || "文件夹"}
              </span>
              {onRename && (
                <button
                  type="button"
                  className="folder-rename-btn"
                  aria-label="重命名文件夹"
                  title="重命名"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNameValue(folder.name || "");
                    setEditingName(true);
                  }}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 4,
                    borderRadius: 6,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--text-soft)",
                    cursor: "pointer",
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
              )}
            </>
          )}
        </div>
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
          }}
        >
          {localItems.map((it) => {
            const c =
              DEFAULT_ICON_COLORS[it.color % DEFAULT_ICON_COLORS.length] ||
              DEFAULT_ICON_COLORS[0];
            const plain =
              !!it.imageUrl && (it.imageStyle || "plain") === "plain";
            const shapeClass =
              it.imageRadius === "square" ? "radius-square" : "radius-rounded";

            return (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("application/x-folder-item", it.id);
                  e.dataTransfer.setData(
                    "application/x-navhub-item",
                    JSON.stringify({
                      id: it.id,
                      type: "folder-item",
                      folderId: folder.id,
                      groupId: folder.groupId,
                    }),
                  );

                  // Clone the icon container to body to avoid capturing the blurred background from the parent overlay
                  const currentElement = e.currentTarget as HTMLElement;
                  const clone = currentElement.cloneNode(true) as HTMLElement;
                  clone.style.position = "absolute";
                  clone.style.top = "-9999px";
                  clone.style.left = "-9999px";
                  clone.classList.remove("dragging");
                  document.body.appendChild(clone);

                  e.dataTransfer.setDragImage(
                    clone,
                    currentElement.offsetWidth / 2,
                    currentElement.offsetHeight / 2,
                  );

                  setTimeout(() => document.body.removeChild(clone), 0);

                  setDragId(it.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearOutTimer();
                  if (it.id === dragId) return;
                  if (
                    Date.now() < swapLockRef.current &&
                    lastSwapSourceRef.current === dragId &&
                    lastSwapTargetRef.current === it.id
                  )
                    return;

                  const tId = it.id;
                  const aId = dragId;
                  if (aId && aId !== tId) {
                    const n = [...localItems];
                    const fIdx = n.findIndex((x) => x.id === aId);
                    const tIdx = n.findIndex((x) => x.id === tId);
                    if (fIdx >= 0 && tIdx >= 0 && fIdx !== tIdx) {
                      const [m] = n.splice(fIdx, 1);
                      n.splice(tIdx, 0, m);
                      setLocalItems(n);
                      lastSwapSourceRef.current = aId;
                      lastSwapTargetRef.current = tId;
                      swapLockRef.current = Date.now() + 350;
                    }
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearOutTimer();
                  setDragId(null);
                  // Persist the new order if it actually changed
                  const nextOrder = localItems.map((i) => i.id).join(",");
                  if (onReorder && nextOrder !== initialOrderRef.current) {
                    onReorder(localItems.map((i) => i.id));
                    initialOrderRef.current = nextOrder;
                  }
                }}
                onDragEnd={() => {
                  setDragId(null);
                  const nextOrder = localItems.map((i) => i.id).join(",");
                  if (onReorder && nextOrder !== initialOrderRef.current) {
                    onReorder(localItems.map((i) => i.id));
                    initialOrderRef.current = nextOrder;
                  }
                }}
                onClick={() => {
                  const safe = safeHttpUrl(it.url);
                  if (safe) window.open(safe, "_blank", "noopener,noreferrer");
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onItemContext?.(e, it);
                }}
              >
                <div
                  className={
                    "fi-icon " +
                    shapeClass +
                    (plain ? " has-plain-image" : "") +
                    (dragId === it.id ? " dragging" : "")
                  }
                  style={{
                    background: plain ? "transparent" : c.bg,
                    width: "64px",
                    height: "64px",
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "28px",
                    fontWeight: 600,
                    color: "#fff",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    opacity: dragId === it.id ? 0.01 : 1,
                    pointerEvents: dragId === it.id ? "none" : "auto",
                  }}
                >
                  {renderGlyph(it)}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "80px",
                    textAlign: "center",
                    opacity: dragId === it.id ? 0.01 : 1,
                  }}
                >
                  {it.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
