import { useEffect, useRef, useState } from "react";
import type { GroupView, IconView } from "../types";
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";
import { parseBuiltinIconUrl } from "../utils/iconSources";

type SortMode = "group" | "name" | "manual";

export const IconSearchOverlay = ({
  icons,
  groups,
  onClose,
  onOpenIcon,
  onActivateGroup,
}: {
  icons: IconView[];
  groups: GroupView[];
  onClose: () => void;
  onOpenIcon: (icon: IconView) => void;
  onActivateGroup: (groupId: string) => void;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("manual");

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const normalized = query.trim().toLowerCase();

  const rows = icons
    .map((icon, index) => {
      const group = groupMap.get(icon.groupId);
      const haystack = [
        icon.name,
        icon.sub,
        icon.title,
        icon.url,
        group?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        icon,
        group,
        index,
        matched: !normalized || haystack.includes(normalized),
      };
    })
    .filter((row) => row.matched)
    .sort((a, b) => {
      if (sort === "name") return a.icon.name.localeCompare(b.icon.name, "zh-CN");
      if (sort === "group") {
        const byGroup = (a.group?.name || "").localeCompare(b.group?.name || "", "zh-CN");
        if (byGroup !== 0) return byGroup;
        return a.icon.name.localeCompare(b.icon.name, "zh-CN");
      }
      return a.index - b.index;
    });

  const open = (icon: IconView) => {
    onActivateGroup(icon.groupId);
    if (icon.isFolder || !icon.url || icon.url === "#") {
      onClose();
      return;
    }
    onOpenIcon(icon);
    onClose();
  };

  return (
    <div
      className="icon-search-overlay"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      <div className="icon-search-shell glass-strong" onClick={(e) => e.stopPropagation()}>
        <div className="icon-search-top">
          <div className="icon-search-input-wrap">
            <Icon name="search" size={26} stroke={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索图标"
            />
          </div>

          <div className="icon-search-toolbar">
            <div className="icon-search-title">
              <span>图标搜索</span>
              <span className="icon-search-count">{rows.length}</span>
            </div>
            <div className="icon-search-sort">
              <button
                className={"icon-search-sort-btn" + (sort === "manual" ? " active" : "")}
                onClick={() => setSort("manual")}
              >
                当前顺序
              </button>
              <button
                className={"icon-search-sort-btn" + (sort === "name" ? " active" : "")}
                onClick={() => setSort("name")}
              >
                名称
              </button>
              <button
                className={"icon-search-sort-btn" + (sort === "group" ? " active" : "")}
                onClick={() => setSort("group")}
              >
                分类
              </button>
            </div>
          </div>
        </div>

        <div className="icon-search-results">
          {rows.length === 0 ? (
            <div className="icon-search-empty">
              <div className="icon-search-empty-title">没有匹配的图标</div>
              <div className="icon-search-empty-sub">试试名称、分类、备注或链接关键字。</div>
            </div>
          ) : (
            <div className="icon-search-grid">
              {rows.map(({ icon, group }) => (
                <SearchResultCard
                  key={icon.id}
                  icon={icon}
                  groupName={group?.name || "未分类"}
                  onClick={() => open(icon)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SearchResultCard = ({
  icon,
  groupName,
  onClick,
}: {
  icon: IconView;
  groupName: string;
  onClick: () => void;
}) => {
  const color = DEFAULT_ICON_COLORS[icon.color % DEFAULT_ICON_COLORS.length] || DEFAULT_ICON_COLORS[0];
  const text = icon.letter || icon.name?.[0] || "?";
  const builtin = parseBuiltinIconUrl(icon.imageUrl);
  const plainImage = !!icon.imageUrl && (icon.imageStyle || "plain") === "plain";
  const radiusClass =
    icon.size !== "circle-size"
      ? (icon.imageRadius === "square" ? "radius-square" : "radius-rounded")
      : "";

  return (
    <button className="icon-search-card" onClick={onClick}>
      <div className="icon-search-art-wrap">
        {builtin && plainImage ? (
          <div className={"icon-search-art-plain " + radiusClass}>
            <Icon name={builtin} size={40} stroke={1.8} />
          </div>
        ) : builtin ? (
          <div
            className={"icon-search-art icon-search-art-" + (icon.size || "sq")}
            style={{ background: color.bg }}
          >
            <Icon name={builtin} size={28} stroke={1.8} />
          </div>
        ) : icon.imageUrl && plainImage ? (
          <img className={"icon-search-art-image plain " + radiusClass} src={icon.imageUrl} alt="" />
        ) : icon.imageUrl ? (
          <img className={"icon-search-art-image framed " + radiusClass} src={icon.imageUrl} alt="" />
        ) : (
          <div
            className={"icon-search-art icon-search-art-" + (icon.size || "sq")}
            style={{ background: color.bg }}
          >
            {icon.isFolder ? <Icon name="grid" size={28} stroke={1.7} /> : text}
          </div>
        )}
      </div>
      <div className="icon-search-name">{icon.name}</div>
      <div className="icon-search-group">{groupName}</div>
    </button>
  );
};
