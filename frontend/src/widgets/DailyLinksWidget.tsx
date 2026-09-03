import { useMemo } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { WidgetEmpty } from "./WidgetEmpty";
import type { WidgetProps } from "./types";

function daySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function pick<T>(arr: T[], n: number, seed: number): T[] {
  if (arr.length <= n) return arr.slice();
  const out: T[] = [];
  const used = new Set<number>();
  let x = seed || 1;
  while (out.length < n && used.size < arr.length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const i = x % arr.length;
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i]);
  }
  return out;
}

export const DailyLinksWidget = ({ w: _w }: WidgetProps = {}) => {
  const { workspace } = useWorkspace();
  const icons = workspace.icons.filter((i) => i.url && !i.isFolder);
  const picks = useMemo(() => pick(icons, 4, daySeed()), [icons]);
  if (picks.length === 0) {
    return (
      <div className="widget w-daily">
        <div className="widget-header">
          <span className="widget-title">今日站点</span>
        </div>
        <WidgetEmpty title="还没有网站" hint="添加图标后，这里会每天推荐几个" />
      </div>
    );
  }
  return (
    <div className="widget w-daily">
      <div className="widget-header">
        <span className="widget-title">今日站点</span>
        <span className="muted" style={{ fontSize: 10 }}>
          每日换一批
        </span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {picks.map((ic) => (
          <a
            key={ic.id}
            href={ic.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              color: "inherit",
              fontSize: 12,
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {ic.imageUrl ? (
                <img src={ic.imageUrl} alt="" width={22} height={22} />
              ) : (
                (ic.letter || ic.name.slice(0, 1)).toUpperCase()
              )}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ic.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};

export const DailyLinksDetail = ({ w }: WidgetProps = {}) => {
  void w;
  return <DailyLinksWidget />;
};
