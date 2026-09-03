import { api } from "../api";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { useWidgetData } from "../hooks/useWidgetData";
import {
  TEMP_UNIT_LABEL,
  convertTempString,
  shouldShowWeatherSetup,
  type TempUnit,
} from "./weatherFormat";
import { widgetTier } from "./widgetTier";
import type { WidgetProps } from "./types";
import { WidgetEmpty } from "./WidgetEmpty";
import { friendlyWidgetError, isUnauthorizedError } from "./widgetErrors";
import { useWorkspace } from "../hooks/useWorkspace";

interface WeatherConfig {
  city?: string;
  /** WIDGET-6: 温度单位偏好(客户端展示换算),默认摄氏。 */
  unit?: TempUnit;
}

const DEFAULTS: WeatherConfig = { city: "", unit: "c" };

export const WeatherWidget = ({ w }: WidgetProps<WeatherConfig> = {}) => {
  const { isGuest } = useWorkspace();
  const { config, update } = useWidgetConfig<WeatherConfig>(w, DEFAULTS);
  const city = (config.city ?? "").trim();
  const unit: TempUnit = config.unit === "f" ? "f" : "c";
  // WIDGET-7: 小尺寸只保留温度+天气,隐藏湿度/风向/AQI 与逐时预报,防溢出。
  const tier = widgetTier(w?.wSpan, w?.wRow);
  const { data, loading, error } = useWidgetData(
    (signal) => api.weather(city || undefined, undefined, undefined, signal),
    [city],
    { refreshMs: 30 * 60_000, cacheKey: `weather:${city || "auto"}` },
  );

  const toggleUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    update({ unit: unit === "c" ? "f" : "c" });
  };

  // 单位切换按钮(在标题右侧),点击时不触发磁贴展开/拖拽。
  const unitToggle = (
    <button
      title="切换温度单位"
      onClick={toggleUnit}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "none",
        borderRadius: 6,
        color: "inherit",
        cursor: "pointer",
        fontSize: 10,
        padding: "2px 6px",
        lineHeight: 1.4,
      }}
    >
      {TEMP_UNIT_LABEL[unit]}
    </button>
  );

  // WIDGET-6(b): 未配置城市且无兜底数据时,给出明确的设置引导空态。
  if (shouldShowWeatherSetup(city, !!data) && !loading && !error) {
    return (
      <div className="widget w-weather">
        <div className="widget-header">
          <span className="widget-title">天气</span>
        </div>
        <WidgetEmpty
          title="未设置城市"
          hint="设置城市后即可查看预报"
          cta="设置城市"
          widgetId={w?.id}
        />
      </div>
    );
  }

  if (error) {
    const guestish = isGuest || isUnauthorizedError(error);
    return (
      <div className="widget w-weather">
        <div className="widget-header">
          <span className="widget-title">{city || "天气"}</span>
        </div>
        <WidgetEmpty
          title={friendlyWidgetError(error, guestish)}
          hint={guestish ? undefined : "稍后自动重试，或设置城市"}
          cta={guestish ? undefined : "设置城市"}
          widgetId={w?.id}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="widget w-weather">
        <div className="widget-header">
          <span className="widget-title">{city || "天气"}</span>
          <span className="muted" style={{ fontSize: 10 }}>
            {loading ? "加载中" : "—"}
          </span>
        </div>
        <div className="temp" style={{ opacity: 0.5 }}>
          --°
        </div>
        <div className="cond">
          <span>⋯</span>
          <span>{loading ? "正在加载…" : ""}</span>
        </div>
      </div>
    );
  }

  const hours = data.hours ?? [];
  return (
    <div className="widget w-weather">
      <div className="widget-header">
        <span className="widget-title">{data.city || city || "天气"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 10 }}>
            {loading ? "更新中" : "已更新"}
          </span>
          {unitToggle}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div className="temp">{convertTempString(data.temp, unit)}</div>
          <div className="cond">
            <span>{hours[0]?.i ?? "·"}</span>
            <span>{convertTempString(data.cond, unit)}</span>
          </div>
        </div>
      </div>
      {tier !== "sm" && (
        <>
          <div className="meta">
            <div>
              湿度<span>{data.humidity}</span>
            </div>
            <div>
              风向<span>{data.wind}</span>
            </div>
            <div>
              AQI<span>{data.aqi}</span>
            </div>
          </div>
          <div className="hours">
            {hours.slice(0, 5).map((x, i) => (
              <div key={i} className="hour">
                {x.h}
                <b>{convertTempString(x.t, unit)}</b>
                <span style={{ fontSize: 14 }}>{x.i}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const WeatherDetail = ({ w }: WidgetProps<WeatherConfig> = {}) => {
  const { config } = useWidgetConfig<WeatherConfig>(w, DEFAULTS);
  const city = (config.city ?? "").trim();
  const unit: TempUnit = config.unit === "f" ? "f" : "c";
  const { data, loading, error } = useWidgetData(
    (signal) => api.weather(city || undefined, undefined, undefined, signal),
    [city],
    { refreshMs: 30 * 60_000, cacheKey: `weather:${city || "auto"}` },
  );
  if (error)
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        {friendlyWidgetError(error, isUnauthorizedError(error))}
      </div>
    );
  if (!data)
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        {loading ? "加载中…" : "暂无数据"}
      </div>
    );
  const hours = data.hours ?? [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 300,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {convertTempString(data.temp, unit)}
        </div>
        <div>
          <div style={{ fontSize: 22 }}>
            {hours[0]?.i ?? ""} {convertTempString(data.cond, unit)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {data.city || city}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        <div
          style={{
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            湿度
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.humidity}</div>
        </div>
        <div
          style={{
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            风向
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.wind}</div>
        </div>
        <div
          style={{
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            AQI
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.aqi}</div>
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          24 小时预报
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {hours.map((x, i) => (
            <div
              key={i}
              style={{
                flex: "0 0 auto",
                minWidth: 60,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              <div className="muted" style={{ fontSize: 11 }}>
                {x.h}
              </div>
              <div style={{ fontSize: 18, margin: "4px 0" }}>{x.i}</div>
              <div style={{ fontSize: 14 }}>{convertTempString(x.t, unit)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
