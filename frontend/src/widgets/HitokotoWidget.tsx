import { useEffect, useState } from "react";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import type { WidgetProps } from "./types";

export type HitokotoType =
  "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l";

interface HitokotoConfig {
  type?: HitokotoType | "";
}

const DEFAULTS: HitokotoConfig = { type: "" };

interface HitokotoResp {
  hitokoto: string;
  from?: string;
  from_who?: string;
}

export const HitokotoWidget = ({ w }: WidgetProps<HitokotoConfig> = {}) => {
  const { config } = useWidgetConfig<HitokotoConfig>(w, DEFAULTS);
  const [data, setData] = useState<HitokotoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = config.type
        ? `https://v1.hitokoto.cn/?c=${encodeURIComponent(config.type)}&encode=json`
        : `https://v1.hitokoto.cn/?encode=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as HitokotoResp);
    } catch (e) {
      // UX-18: 不再把失败伪装成成功。仍给一句兜底文案保证有内容,
      // 但同时标记 error,让 UI 明确显示「加载失败」而非假装拉取成功。
      console.error("Hitokoto load failed", e);
      setData({ hitokoto: "生活明朗，万物可爱。", from: "NavHub" });
      setError("一言加载失败，已显示离线文案");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  return (
    <div className="widget w-hitokoto">
      <div className="widget-header">
        <span className="widget-title">一言</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            load();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={loading}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-soft)",
            cursor: "pointer",
            padding: 2,
            opacity: loading ? 0.4 : 0.8,
          }}
          title="换一句"
        >
          <span
            style={{
              fontSize: 14,
              display: "inline-block",
              transform: loading ? "rotate(180deg)" : undefined,
              transition: "transform 300ms",
            }}
          >
            ↻
          </span>
        </button>
      </div>
      {data ? (
        <>
          {error && (
            <div
              className="muted"
              style={{
                fontSize: 11,
                color: "var(--warn, #d98a00)",
                marginBottom: 6,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              letterSpacing: "0.01em",
            }}
          >
            「{data.hitokoto}」
          </div>
          {(data.from_who || data.from) && (
            <div
              className="muted"
              style={{ marginTop: 10, fontSize: 11, textAlign: "right" }}
            >
              —— {[data.from_who, data.from].filter(Boolean).join(" · ")}
            </div>
          )}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          {loading ? "加载中…" : ""}
        </div>
      )}
    </div>
  );
};

export const HitokotoDetail = ({ w }: WidgetProps<HitokotoConfig> = {}) => {
  const { config } = useWidgetConfig<HitokotoConfig>(w, DEFAULTS);
  const [data, setData] = useState<HitokotoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = config.type
        ? `https://v1.hitokoto.cn/?c=${encodeURIComponent(config.type)}&encode=json`
        : `https://v1.hitokoto.cn/?encode=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as HitokotoResp);
    } catch (e) {
      // UX-18: 同上,失败不伪装成功——保留兜底文案但标记 error。
      console.error("Hitokoto load failed", e);
      setData({ hitokoto: "生活明朗，万物可爱。", from: "NavHub" });
      setError("一言加载失败，已显示离线文案");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [config.type]);
  return (
    <div style={{ display: "grid", gap: 20, padding: "20px 0" }}>
      {data ? (
        <>
          {error && (
            <div
              className="muted"
              style={{
                fontSize: 12,
                color: "var(--warn, #d98a00)",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.7,
              textAlign: "center",
              letterSpacing: "0.02em",
            }}
          >
            「{data.hitokoto}」
          </div>
          {(data.from_who || data.from) && (
            <div className="muted" style={{ fontSize: 13, textAlign: "right" }}>
              —— {[data.from_who, data.from].filter(Boolean).join(" · ")}
            </div>
          )}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          {loading ? "加载中…" : ""}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          className="wcc-btn-add"
          style={{ padding: "8px 22px" }}
          onClick={load}
          disabled={loading}
        >
          换一句
        </button>
      </div>
    </div>
  );
};
