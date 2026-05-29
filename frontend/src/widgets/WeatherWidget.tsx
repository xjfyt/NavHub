import { api } from "../api";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { useWidgetData } from "../hooks/useWidgetData";
import type { WidgetProps } from "./types";

interface WeatherConfig {
  city?: string;
}

const DEFAULTS: WeatherConfig = { city: "" };

export const WeatherWidget = ({ w }: WidgetProps<WeatherConfig> = {}) => {
  const { config } = useWidgetConfig<WeatherConfig>(w, DEFAULTS);
  const city = (config.city ?? "").trim();
  const { data, loading, error } = useWidgetData(
    (signal) => api.weather(city || undefined, undefined, undefined, signal),
    [city],
    { refreshMs: 30 * 60_000 },
  );

  if (error) {
    return (
      <div className="widget w-weather">
        <div className="widget-header">
          <span className="widget-title">{city || "天气"}</span>
          <span className="muted mono" style={{ fontSize: 10 }}>ERROR</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {error.message || "加载失败"}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="widget w-weather">
        <div className="widget-header">
          <span className="widget-title">{city || "天气"}</span>
          <span className="muted mono" style={{ fontSize: 10 }}>
            {loading ? "LOADING" : "—"}
          </span>
        </div>
        <div className="temp" style={{ opacity: 0.5 }}>--°</div>
        <div className="cond"><span>⋯</span><span>{loading ? "正在加载…" : ""}</span></div>
      </div>
    );
  }

  const hours = data.hours ?? [];
  return (
    <div className="widget w-weather">
      <div className="widget-header">
        <span className="widget-title">{data.city || city || "天气"}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {loading ? "UPDATING" : "UPDATED"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div className="temp">{data.temp}</div>
          <div className="cond">
            <span>{hours[0]?.i ?? "·"}</span>
            <span>{data.cond}</span>
          </div>
        </div>
      </div>
      <div className="meta">
        <div>湿度<span>{data.humidity}</span></div>
        <div>风向<span>{data.wind}</span></div>
        <div>AQI<span>{data.aqi}</span></div>
      </div>
      <div className="hours">
        {hours.slice(0, 5).map((x, i) => (
          <div key={i} className="hour">
            {x.h}<b>{x.t}</b><span style={{ fontSize: 14 }}>{x.i}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const WeatherDetail = ({ w }: WidgetProps<WeatherConfig> = {}) => {
  const { config } = useWidgetConfig<WeatherConfig>(w, DEFAULTS);
  const city = (config.city ?? "").trim();
  const { data, loading, error } = useWidgetData(
    (signal) => api.weather(city || undefined, undefined, undefined, signal),
    [city],
    { refreshMs: 30 * 60_000 },
  );
  if (error) return <div className="muted" style={{ fontSize: 13 }}>{error.message || "加载失败"}</div>;
  if (!data) return <div className="muted" style={{ fontSize: 13 }}>{loading ? "加载中…" : "暂无数据"}</div>;
  const hours = data.hours ?? [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ fontSize: 56, fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1 }}>{data.temp}</div>
        <div>
          <div style={{ fontSize: 22 }}>{hours[0]?.i ?? ""} {data.cond}</div>
          <div className="muted" style={{ fontSize: 12 }}>{data.city || city}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          <div className="muted" style={{ fontSize: 11 }}>湿度</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.humidity}</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          <div className="muted" style={{ fontSize: 11 }}>风向</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.wind}</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          <div className="muted" style={{ fontSize: 11 }}>AQI</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{data.aqi}</div>
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>24 小时预报</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {hours.map((x, i) => (
            <div key={i} style={{ flex: "0 0 auto", minWidth: 60, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8, textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 11 }}>{x.h}</div>
              <div style={{ fontSize: 18, margin: "4px 0" }}>{x.i}</div>
              <div style={{ fontSize: 14 }}>{x.t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
