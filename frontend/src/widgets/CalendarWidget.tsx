import { Icon } from "../components/Icon";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { addMonths, buildMonthGrid, MONTH_NAMES_CN, type TodayRef } from "./calendarMath";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";

interface CalendarConfig {
  /** WIDGET-9: 当前查看的年份/月份(0-based);为空则用当前真实月份。
   *  存进 config 后磁贴与详情共享同一个月份,翻页保持同步。 */
  viewYear?: number;
  viewMonth?: number;
}

const DEFAULTS: CalendarConfig = {};

function todayRef(): TodayRef {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth(), day: t.getDate() };
}

/** 解析配置中的年月,缺省回落到当前真实月份。 */
function resolveView(config: CalendarConfig, td: TodayRef): { year: number; month: number } {
  const year =
    typeof config.viewYear === "number" && Number.isFinite(config.viewYear)
      ? config.viewYear
      : td.year;
  const month =
    typeof config.viewMonth === "number" && config.viewMonth >= 0 && config.viewMonth <= 11
      ? config.viewMonth
      : td.month;
  return { year, month };
}

export const CalendarWidget = ({ w }: WidgetProps<CalendarConfig> = {}) => {
  const { config, update } = useWidgetConfig<CalendarConfig>(w, DEFAULTS);
  const td = todayRef();
  const { year, month } = resolveView(config, td);
  const cells = buildMonthGrid(year, month, td);
  // WIDGET-7: 小尺寸隐藏「星期」副标题,让出垂直空间给月历网格,避免裁切。
  const tier = widgetTier(w?.wSpan, w?.wRow);

  const go = (delta: number) => {
    const next = addMonths(year, month, delta);
    update({ viewYear: next.year, viewMonth: next.month });
  };
  const goToday = () => update({ viewYear: td.year, viewMonth: td.month });

  return (
    <div className="widget w-calendar">
      <div className="cal-head">
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div className="cal-month">{year} · {MONTH_NAMES_CN[month]}</div>
          {tier !== "sm" && (
            <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {new Date(td.year, td.month, td.day).toLocaleDateString('zh-CN', { weekday: 'long' })}
            </div>
          )}
        </div>
        <div className="cal-nav">
          <button onClick={(e) => { e.stopPropagation(); go(-1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="chevron-left" size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); goToday(); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="star" size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); go(1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="chevron-right" size={12} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {"日一二三四五六".split("").map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((c, i) => (
          <div
            key={i}
            className={"cal-day" + (c.out ? " out" : "") + (c.today ? " today" : "") + (c.holiday ? " has" : "")}
            title={c.holiday ?? undefined}
          >{c.d}</div>
        ))}
      </div>
    </div>
  );
};

export const CalendarDetail = ({ w }: WidgetProps<CalendarConfig> = {}) => {
  const { config, update } = useWidgetConfig<CalendarConfig>(w, DEFAULTS);
  const td = todayRef();
  const { year, month } = resolveView(config, td);
  const cells = buildMonthGrid(year, month, td);

  const go = (delta: number) => {
    const next = addMonths(year, month, delta);
    update({ viewYear: next.year, viewMonth: next.month });
  };
  const goToday = () => update({ viewYear: td.year, viewMonth: td.month });

  // 本月固定公历节日清单(供详情底部展示)。
  const monthHolidays = cells
    .filter((c) => !c.out && c.holiday)
    .map((c) => ({ d: c.d, name: c.holiday as string }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{year} · {MONTH_NAMES_CN[month]}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            今天：{new Date(td.year, td.month, td.day).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={() => go(-1)}><Icon name="chevron-left" size={12} /></button>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={goToday}>今天</button>
          <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={() => go(1)}><Icon name="chevron-right" size={12} /></button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {"日一二三四五六".split("").map((d) => (
          <div key={d} className="muted" style={{ textAlign: "center", fontSize: 11, padding: 6 }}>{d}</div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            title={c.holiday ?? undefined}
            style={{
              position: "relative",
              textAlign: "center",
              padding: "12px 0",
              fontSize: 14,
              borderRadius: 8,
              opacity: c.out ? 0.3 : 1,
              background: c.today ? "var(--accent)" : "rgba(255,255,255,0.03)",
              color: c.today ? "#000" : "inherit",
              fontWeight: c.today ? 700 : 400,
            }}
          >
            {c.d}
            {!c.out && c.holiday && (
              <span
                aria-hidden
                style={{
                  position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
                  width: 4, height: 4, borderRadius: "50%",
                  background: c.today ? "#000" : "var(--accent)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      {monthHolidays.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>本月节日</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {monthHolidays.map((h) => (
              <span
                key={`${h.d}-${h.name}`}
                style={{ fontSize: 12, padding: "4px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 999 }}
              >
                {MONTH_NAMES_CN[month]}{h.d}日 · {h.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
