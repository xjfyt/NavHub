import React, { useRef } from "react";
import { IconView, FolderItemView } from "../types";
import { Icon } from "./Icon";
import { parseBuiltinIconUrl, resolveSiteLink, safeHttpUrl } from "../utils/iconSources";
import { safeIconColor } from "../utils/iconColor";

type TileRenderable = Pick<
  IconView | FolderItemView,
  "imageUrl" | "imageStyle" | "imageRadius" | "letter" | "name"
>;

export const IconTile = ({
  icon,
  onClick,
  onContext,
  dragProps,
  newTab = true,
}: {
  icon: IconView;
  onClick?: (e: React.MouseEvent, icon: IconView) => void;
  onContext?: (e: React.MouseEvent, icon: IconView) => void;
  dragProps?: any;
  /** A11Y-1: 站点磁贴是否新标签页打开(对应 iconOpen 偏好,默认沿用「新标签页」)。 */
  newTab?: boolean;
}) => {
  const color = safeIconColor(icon.color);
  const ctx = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContext?.(e, icon);
  };

  // A11Y-1: 把站点磁贴变成真实的 <a href>，让中键 / Ctrl·Cmd-点击 / 右键复制链接等
  // 浏览器原生行为开箱即用,并带来键盘可达性与 SEO/语义。仅当:
  //   • 非文件夹(文件夹打开的是浮层,不是 URL,保持 <button>);
  //   • 非 iframe 预览(预览走 onClick 打开模态框,不是真正跳转);
  //   • 有可点击回调(onClick 存在 —— 排除 AddIconModal 里的静态预览磁贴);
  //   • safeHttpUrl 过滤后是安全的 http/https(SEC-9)。
  // 上述任一不满足 → 退化为非跳转的 <div>(保持原视觉),绝不输出不安全 href。
  const siteLink =
    !icon.isFolder && !icon.iframePreview && onClick
      ? resolveSiteLink(icon.url, { newTab })
      : null;

  // 拖拽 vs 点击判定:dnd-kit 的传感器只在 document 捕获阶段对拖拽后的 click 调用
  // stopPropagation —— 它能压住 React 的 onClick,却压不住 <a> 的原生跳转(默认行为
  // 与冒泡无关)。因此在锚点自身记录 pointerdown 位置,若 click 时指针位移超过鼠标
  // 拖拽阈值(4px,与 mouseActivationConstraint 对齐),判定为「刚发生过拖拽」,
  // preventDefault 取消这次原生跳转;普通点击(几乎无位移)正常跳转。
  const downPosRef = useRef<{ x: number; y: number } | null>(null);

  // 站点磁贴可点击表面:<a href>(导航)或退化的 <div>(预览/不安全/文件夹/iframe)。
  // 统一在此决定元素类型,保证所有尺寸分支视觉一致(同 className、text-decoration:none、
  // color:inherit 由样式表里的 .tile 规则继承)。
  // 注意:这是一个返回 JSX 的普通函数,不是嵌套定义的组件 —— 后者会在每次父级重渲染时
  // 被当成新组件类型而重挂载子树,导致键盘焦点丢失(正是本次要修好的 a11y 体验)。
  const renderSurface = (className: string, children: React.ReactNode) => {
    if (siteLink) {
      return (
        <a
          className={className}
          href={siteLink.href}
          {...(siteLink.target ? { target: siteLink.target } : {})}
          {...(siteLink.rel ? { rel: siteLink.rel } : {})}
          draggable={false}
          {...(dragProps || {})}
          onPointerDown={(e) => {
            downPosRef.current = { x: e.clientX, y: e.clientY };
          }}
          onClick={(e) => {
            // 仅拦截「左键纯点击且伴随拖拽位移」的情况:中键/带修饰键的点击交给浏览器
            // 原生处理(新标签页 / 后台标签页),不可在此 preventDefault。
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              const start = downPosRef.current;
              if (start) {
                const moved =
                  Math.abs(e.clientX - start.x) > 4 || Math.abs(e.clientY - start.y) > 4;
                if (moved) {
                  e.preventDefault();
                  return;
                }
              }
            }
            downPosRef.current = null;
          }}
          onContextMenu={ctx}
        >
          {children}
        </a>
      );
    }
    return (
      <div
        className={className}
        {...(dragProps || {})}
        onClick={onClick ? (e) => onClick(e, icon) : undefined}
        onContextMenu={ctx}
      >
        {children}
      </div>
    );
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
          alt={item.name || ""}
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
                        const c = safeIconColor(ov.color);
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

              const c = safeIconColor(it.color);
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
                  if (isLink) { const safe = safeHttpUrl(it.url); if (safe) window.open(safe, "_blank", "noopener,noreferrer"); }
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

    // 普通方形文件夹打开的是浮层而非 URL,且内部无嵌套交互元素 ——
    // 用真正的 <button type="button"> 以获得原生键盘激活(Enter/Space)与语义。
    // (lg / lg-9 文件夹网格内含可点击的直达项/展开器,嵌套进 button 属无效 HTML,故保持 div。)
    return (
      <button type="button" className={"tile folder sq"} {...(dragProps || {})} onClick={e => onClick?.(e, icon)} onContextMenu={ctx}>
        <div className="tile-icon">
          {items.slice(0, 4).map((it, i) => {
            const c = safeIconColor(it.color);
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
      </button>
    );
  }
  
  if (icon.size === "lg") {
    return renderSurface(
      "tile lg",
      <>
        <div
          className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
          style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
        >
          {renderGlyph(icon)}
        </div>
        <div className={labelClass}>{icon.name}</div>
      </>,
    );
  }

  if (icon.size === "pill-size") {
    return renderSurface(
      "tile pill-size",
      <>
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
      </>,
    );
  }

  if (icon.size === "circle-size") {
    return renderSurface(
      "tile circle-size",
      <>
        <div
          className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
          style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
        >
          {renderGlyph(icon)}
        </div>
        <div className={labelClass}>{icon.name}</div>
      </>,
    );
  }

  return renderSurface(
    "tile sq",
    <>
      <div
        className={"tile-icon " + radiusClass + (imageMode === "plain" ? " has-plain-image" : "")}
        style={{ background: imageMode === "plain" ? "transparent" : color.bg }}
      >
        {renderGlyph(icon)}
      </div>
      <div className={labelClass}>{icon.name}</div>
    </>,
  );
};
