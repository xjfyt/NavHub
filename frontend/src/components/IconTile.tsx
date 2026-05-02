import React from "react";
import { IconView, FolderItemView } from "../types";
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";
import { parseBuiltinIconUrl } from "../utils/iconSources";

type TileRenderable = Pick<
  IconView | FolderItemView,
  "imageUrl" | "imageStyle" | "imageRadius" | "letter" | "name"
>;

export const IconTile = ({ 
  icon, 
  onClick, 
  onContext, 
  dragProps 
}: { 
  icon: IconView; 
  onClick?: (e: React.MouseEvent, icon: IconView) => void; 
  onContext?: (e: React.MouseEvent, icon: IconView) => void;
  dragProps?: any;
}) => {
  const color = DEFAULT_ICON_COLORS[icon.color % DEFAULT_ICON_COLORS.length] || DEFAULT_ICON_COLORS[0];
  const ctx = (e: React.MouseEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    onContext?.(e, icon); 
  };

  // Default to "plain" for image icons so the favicon fills the tile like a native app icon.
  // "framed" (padded inside a colored box) can still be forced via explicit imageStyle setting.
  const imageMode = icon.imageUrl ? (icon.imageStyle || "plain") : "framed";
  const radiusClass =
    icon.imageUrl && icon.size !== "circle-size"
      ? (icon.imageRadius === "square" ? "radius-square" : "radius-rounded")
      : "";
  const fontSize = icon.fontSize || "md";
  const textAlign = icon.textAlign || "center";
  const labelClass = `tile-label font-${fontSize} align-${textAlign}`;

  const renderGlyph = (item: TileRenderable, fallback?: string) => {
    const builtin = parseBuiltinIconUrl(item.imageUrl);
    const plain = !!item.imageUrl && (item.imageStyle || "plain") === "plain";
    const shapeClass = item.imageRadius === "square" ? "radius-square" : "radius-rounded";
    if (builtin) {
      return (
        <span className={"tile-image-glyph " + shapeClass + (plain ? " plain" : "")}>
          <Icon name={builtin} size="100%" stroke={1.8} />
        </span>
      );
    }
    if (item.imageUrl) {
      return (
        <img
          className={"tile-image " + shapeClass + (plain ? " plain" : " framed")}
          src={item.imageUrl}
          alt=""
          draggable={false}
        />
      );
    }
    if (fallback) return fallback;
    return icon.letter || icon.name[0] || "?";
  };

  if (icon.isFolder) {
    const items = icon.folderItems || [];
    const size = icon.size;
    const isLg4 = size === "lg-4" || size === "lg";
    const isLg9 = size === "lg-9";

    if (isLg4 || isLg9) {
      const maxItems = isLg4 ? 4 : 9;
      const displayItems = items.slice(0, maxItems);
      return (
        <div className={`tile folder-grid lg ${isLg9 ? "grid-9" : "grid-4"}`} onClick={e => onClick?.(e, icon)} onContextMenu={ctx} {...(dragProps || {})}>
          <div className="folder-grid-square">
          <div className="folder-grid-bg" />
          <div className="folder-grid-items">
            {Array.from({ length: maxItems }).map((_, i) => {
              const it = displayItems[i];
              const isLast = i === maxItems - 1;

              if (isLast) {
                const overflowStart = maxItems - 1;
                const overflowItems = items.slice(overflowStart, overflowStart + 4);
                
                if (overflowItems.length === 0) {
                  return <div key={"e"+i} className="fg-item empty" onClick={e => { e.stopPropagation(); onClick?.(e, icon); }} onContextMenu={ctx} />;
                }
                
                return (
                  <div key="expand" className="fg-item expander" onClick={e => { e.stopPropagation(); onClick?.(e, icon); }} onContextMenu={ctx}>
                    <div className="folder-overflow-grid" style={{ width: '100%', height: '100%', borderRadius: isLg9 ? '12px' : '20px' }}>
                      {overflowItems.map((ov, idx) => {
                        const c = DEFAULT_ICON_COLORS[ov.color % DEFAULT_ICON_COLORS.length] || DEFAULT_ICON_COLORS[0];
                        const plain = !!ov.imageUrl && (ov.imageStyle || "plain") === "plain";
                        const shapeClass = ov.imageRadius === "square" ? "radius-square " : "radius-rounded ";
                        return (
                          <div
                            key={ov.id || idx}
                            className={"folder-mini " + shapeClass + (plain ? "plain-image" : "")}
                            style={{ background: plain ? "transparent" : c.bg }}
                          >
                            {renderGlyph(ov, ov.letter || ov.name?.[0] || "?")}
                          </div>
                        );
                      })}
                      {Array.from({ length: Math.max(0, 4 - overflowItems.length) }).map((_, idx) => (
                        <div key={"e" + idx} className="folder-mini" style={{ background: 'transparent' }} />
                      ))}
                    </div>
                  </div>
                );
              }

              if (!it) {
                return <div key={"e"+i} className="fg-item empty" onClick={e => { e.stopPropagation(); onClick?.(e, icon); }} onContextMenu={ctx} />;
              }

              const c = DEFAULT_ICON_COLORS[it.color % DEFAULT_ICON_COLORS.length] || DEFAULT_ICON_COLORS[0];
              const plain = !!it.imageUrl && (it.imageStyle || "plain") === "plain";
              const shapeClass = it.imageRadius === "square" ? "radius-square" : "radius-rounded";
              
              const isLink = !!it.url && it.url !== "#";
              const Inner = (
                <div className={"fi-icon " + shapeClass + (plain ? " has-plain-image" : "")} style={{ background: plain ? "transparent" : c.bg }}>
                   {renderGlyph(it, it.letter || it.name?.[0] || "?")}
                </div>
              );

              return (
                <div key={it.id} className="fg-item direct-link" style={{ WebkitUserDrag: 'none' } as any} onClick={e => {
                  e.stopPropagation();
                  if (isLink) window.open(it.url!, "_blank");
                  else onClick?.(e, icon);
                }} onContextMenu={ctx}>
                  {Inner}
                </div>
              );
            })}
          </div>
          </div>
          <div className={labelClass}>{icon.name}</div>
        </div>
      );
    }

    return (
      <div className={"tile folder sq"} {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
        <div className="tile-icon">
          {items.slice(0, 4).map((it, i) => {
            const c = DEFAULT_ICON_COLORS[it.color % DEFAULT_ICON_COLORS.length] || DEFAULT_ICON_COLORS[0];
            const folderPlain = !!it.imageUrl && (it.imageStyle || "plain") === "plain";
            return (
              <div
                key={it.id || i}
                className={
                  "folder-mini " +
                  (it.imageRadius === "square" ? "radius-square " : "radius-rounded ") +
                  (folderPlain ? "plain-image" : "")
                }
                style={{ background: folderPlain ? "transparent" : c.bg }}
              >
                {renderGlyph(it, it.letter || it.name?.[0] || "?")}
              </div>
            );
          })}
        </div>
        <div className={labelClass}>{icon.name}</div>
      </div>
    );
  }
  
  if (icon.size === "lg") {
    return (
      <div className="tile lg" {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
        <div
          className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
          style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
        >
          {renderGlyph(icon)}
        </div>
        <div className={labelClass}>{icon.name}</div>
      </div>
    );
  }
  
  if (icon.size === "pill-size") {
    return (
      <div className="tile pill-size" {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
        <div
          className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
          style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
        >
          {renderGlyph(icon)}
        </div>
        <div className={`tile-text font-${fontSize} align-${textAlign}`}>
          <span className="main">{icon.name}</span>
          <span className="sub">{icon.sub || icon.url}</span>
        </div>
      </div>
    );
  }
  
  if (icon.size === "circle-size") {
    return (
      <div className="tile circle-size" {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
        <div
          className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
          style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
        >
          {renderGlyph(icon)}
        </div>
        <div className={labelClass}>{icon.name}</div>
      </div>
    );
  }
  
  return (
    <div className="tile sq" {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
      <div
        className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
        style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
      >
        {renderGlyph(icon)}
      </div>
      <div className={labelClass}>{icon.name}</div>
    </div>
  );
};
