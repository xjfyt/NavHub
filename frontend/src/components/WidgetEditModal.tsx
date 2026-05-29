import { useCallback, useMemo, useState } from "react";
import type { WidgetView } from "../types";
import { api } from "../api";
import { useWorkspace } from "../hooks/useWorkspace";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

type SourceId = "weibo" | "zhihu" | "bilibili" | "juejin";

const HOT_SOURCES: { id: SourceId; label: string }[] = [
  { id: "weibo", label: "微博" },
  { id: "zhihu", label: "知乎" },
  { id: "bilibili", label: "B 站" },
  { id: "juejin", label: "掘金" },
];

interface NeteaseSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  picUrl?: string;
  durationMs?: number;
}

export const WidgetEditModal = ({
  widget,
  onClose,
}: {
  widget: WidgetView;
  onClose: () => void;
}) => {
  const { updateWidget } = useWorkspace();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...(widget.config ?? {}),
  }));
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateWidget(widget.id, { config: draft });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [draft, onClose, updateWidget, widget.id]);

  const patch = useCallback((p: Record<string, unknown>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const body = (() => {
    switch (widget.widget) {
      case "clock":
        return <ClockEdit value={draft as ClockDraft} onChange={patch} />;
      case "weather":
        return (
          <WeatherEdit
            value={draft as { city?: string; unit?: "c" | "f" }}
            onChange={patch}
          />
        );
      case "countdown":
        return (
          <CountdownEdit value={draft as CountdownDraft} onChange={patch} />
        );
      case "rss":
        return (
          <RssEdit value={draft as { source?: SourceId }} onChange={patch} />
        );
      case "iframe":
        return (
          <IframeEdit
            value={draft as { url?: string; title?: string }}
            onChange={patch}
          />
        );
      case "music":
        return <MusicEdit value={draft as MusicDraft} onChange={patch} />;
      case "pomodoro":
        return <PomodoroEdit value={draft as PomodoroDraft} onChange={patch} />;
      case "hitokoto":
        return <HitokotoEdit value={draft as HitokotoDraft} onChange={patch} />;
      case "search":
        return (
          <SearchEdit
            value={draft as { placeholder?: string }}
            onChange={patch}
          />
        );
      default:
        return <div className="muted">该小组件暂不支持配置编辑。</div>;
    }
  })();

  const title = useMemo(() => {
    switch (widget.widget) {
      case "clock":
        return "编辑 · 时钟";
      case "weather":
        return "编辑 · 天气";
      case "countdown":
        return "编辑 · 倒计时";
      case "rss":
        return "编辑 · 热搜";
      case "iframe":
        return "编辑 · 嵌入网页";
      case "music":
        return "编辑 · 音乐";
      case "pomodoro":
        return "编辑 · 番茄钟";
      case "hitokoto":
        return "编辑 · 一言";
      case "search":
        return "编辑 · 搜索";
      default:
        return "编辑小组件";
    }
  }, [widget.widget]);

  return (
    <Modal
      onClose={onClose}
      labelledById="widget-edit-title"
      overlayClassName="wcc-backdrop"
      className="glass-strong"
      contentStyle={{
        width: 480,
        maxWidth: "90vw",
        padding: 20,
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <h3 id="widget-edit-title" style={{ margin: 0, flex: 1, fontSize: 16 }}>
          {title}
        </h3>
        <button
          className="wcc-btn-cancel"
          onClick={onClose}
          aria-label="关闭"
          style={{ padding: 4 }}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {body}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 20,
        }}
      >
        <button className="wcc-btn-cancel" onClick={onClose}>
          取消
        </button>
        <button className="wcc-btn-add" onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </Modal>
  );
};

interface ClockDraft {
  timeZone?: string;
  hour12?: boolean;
}

const CLOCK_TZ_OPTIONS: { tz: string; label: string }[] = [
  { tz: "", label: "本地" },
  { tz: "UTC", label: "UTC" },
  { tz: "Asia/Shanghai", label: "北京" },
  { tz: "Asia/Tokyo", label: "东京" },
  { tz: "America/New_York", label: "纽约" },
  { tz: "America/Los_Angeles", label: "洛杉矶" },
  { tz: "Europe/London", label: "伦敦" },
  { tz: "Europe/Paris", label: "巴黎" },
];

function ClockEdit({
  value,
  onChange,
}: {
  value: ClockDraft;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const tz = value.timeZone ?? "";
  const hour12 = value.hour12 ?? false;
  return (
    <div className="wcc-form">
      <label className="wcc-label">时区</label>
      <select
        className="wcc-input"
        value={tz}
        onChange={(e) => onChange({ timeZone: e.target.value })}
      >
        {CLOCK_TZ_OPTIONS.map((z) => (
          <option key={z.tz || "local"} value={z.tz}>
            {z.label}
          </option>
        ))}
      </select>
      <label className="wcc-label" style={{ marginTop: 12 }}>
        时制
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={"wcc-btn-cancel" + (!hour12 ? " active" : "")}
          style={{
            flex: 1,
            background: !hour12 ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ hour12: false })}
        >
          24 小时制
        </button>
        <button
          className={"wcc-btn-cancel" + (hour12 ? " active" : "")}
          style={{
            flex: 1,
            background: hour12 ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ hour12: true })}
        >
          12 小时制
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        问候语会按所选时区的当前时间显示（早上好 / 下午好 / 晚上好）。
      </div>
    </div>
  );
}

function WeatherEdit({
  value,
  onChange,
}: {
  value: { city?: string; unit?: "c" | "f" };
  onChange: (p: Record<string, unknown>) => void;
}) {
  const unit = value.unit === "f" ? "f" : "c";
  return (
    <div className="wcc-form">
      <label className="wcc-label">城市</label>
      <input
        className="wcc-input"
        placeholder="例如：北京 / 上海 / Tokyo"
        value={value.city ?? ""}
        onChange={(e) => onChange({ city: e.target.value })}
      />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        使用 Open‑Meteo 免费 API，中文地名自动解析经纬度。
      </div>
      <label className="wcc-label" style={{ marginTop: 12 }}>
        温度单位
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={"wcc-btn-cancel" + (unit === "c" ? " active" : "")}
          style={{
            flex: 1,
            background: unit === "c" ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ unit: "c" })}
        >
          摄氏 °C
        </button>
        <button
          className={"wcc-btn-cancel" + (unit === "f" ? " active" : "")}
          style={{
            flex: 1,
            background: unit === "f" ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ unit: "f" })}
        >
          华氏 °F
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        后端按摄氏返回，华氏在本地换算显示，也可点磁贴右上角小按钮快速切换。
      </div>
    </div>
  );
}

interface CountdownDraft {
  title?: string;
  targetDate?: string;
  mode?: "up" | "down";
}

function CountdownEdit({
  value,
  onChange,
}: {
  value: CountdownDraft;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const mode = value.mode ?? "down";
  return (
    <div className="wcc-form">
      <label className="wcc-label">事件名称</label>
      <input
        className="wcc-input"
        placeholder="例如：高考 / 纪念日"
        value={value.title ?? ""}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <label className="wcc-label" style={{ marginTop: 12 }}>
        日期
      </label>
      <input
        className="wcc-input"
        type="date"
        value={value.targetDate ?? ""}
        onChange={(e) => onChange({ targetDate: e.target.value })}
      />
      <label className="wcc-label" style={{ marginTop: 12 }}>
        模式
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={"wcc-btn-cancel" + (mode === "down" ? " active" : "")}
          style={{
            flex: 1,
            background: mode === "down" ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ mode: "down" })}
        >
          距离未来
        </button>
        <button
          className={"wcc-btn-cancel" + (mode === "up" ? " active" : "")}
          style={{
            flex: 1,
            background: mode === "up" ? "rgba(255,255,255,0.15)" : undefined,
          }}
          onClick={() => onChange({ mode: "up" })}
        >
          自过去起
        </button>
      </div>
    </div>
  );
}

function RssEdit({
  value,
  onChange,
}: {
  value: { source?: SourceId };
  onChange: (p: Record<string, unknown>) => void;
}) {
  const cur = value.source ?? "weibo";
  return (
    <div className="wcc-form">
      <label className="wcc-label">数据源</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {HOT_SOURCES.map((s) => (
          <button
            key={s.id}
            className="wcc-btn-cancel"
            style={{
              background: cur === s.id ? "rgba(255,255,255,0.16)" : undefined,
              borderColor: cur === s.id ? "rgba(255,255,255,0.3)" : undefined,
            }}
            onClick={() => onChange({ source: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IframeEdit({
  value,
  onChange,
}: {
  value: { url?: string; title?: string };
  onChange: (p: Record<string, unknown>) => void;
}) {
  const url = value.url ?? "";
  const warn = url && !/^https?:\/\//i.test(url);
  return (
    <div className="wcc-form">
      <label className="wcc-label">网址</label>
      <input
        className="wcc-input"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => onChange({ url: e.target.value })}
      />
      {warn && (
        <div
          className="muted"
          style={{ fontSize: 12, marginTop: 6, color: "#ffd07a" }}
        >
          未带协议前缀，将自动按 https:// 加载。
        </div>
      )}
      <label className="wcc-label" style={{ marginTop: 12 }}>
        标题（可选）
      </label>
      <input
        className="wcc-input"
        placeholder="显示在标签栏上的名字"
        value={value.title ?? ""}
        onChange={(e) => onChange({ title: e.target.value })}
      />
    </div>
  );
}

interface MusicDraft {
  playlist?: NeteaseSong[];
  currentId?: number;
}

function MusicEdit({
  value,
  onChange,
}: {
  value: MusicDraft;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NeteaseSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playlist = value.playlist ?? [];

  const search = async () => {
    const s = q.trim();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.musicSearch(s);
      setResults(r.songs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const addSong = (song: NeteaseSong) => {
    if (playlist.some((s) => s.id === song.id)) return;
    const next = [...playlist, song];
    const patch: Record<string, unknown> = { playlist: next };
    if (value.currentId == null) patch.currentId = song.id;
    onChange(patch);
  };

  const removeSong = (id: number) => {
    const next = playlist.filter((s) => s.id !== id);
    const patch: Record<string, unknown> = { playlist: next };
    if (value.currentId === id) patch.currentId = next[0]?.id;
    onChange(patch);
  };

  return (
    <div className="wcc-form">
      <label className="wcc-label">搜索歌曲</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="wcc-input"
          style={{ flex: 1 }}
          placeholder="歌名 / 歌手"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button className="wcc-btn-add" onClick={search} disabled={loading}>
          {loading ? "…" : "搜索"}
        </button>
      </div>
      {error && (
        <div
          className="muted"
          style={{ fontSize: 12, marginTop: 6, color: "#ff9b7b" }}
        >
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div
          style={{
            maxHeight: 180,
            overflowY: "auto",
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {results.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px",
              }}
            >
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                  }}
                >
                  {s.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {s.artist}
                </div>
              </div>
              <button
                className="wcc-btn-cancel"
                style={{ padding: "2px 8px" }}
                onClick={() => addSong(s)}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="wcc-label" style={{ marginTop: 14 }}>
        播放列表（{playlist.length}）
      </label>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 150,
          overflowY: "auto",
        }}
      >
        {playlist.length === 0 && (
          <div className="muted" style={{ fontSize: 12 }}>
            （暂无）
          </div>
        )}
        {playlist.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px",
            }}
          >
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {s.title}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {s.artist}
              </div>
            </div>
            <button
              className="wcc-btn-cancel"
              style={{ padding: "2px 8px" }}
              onClick={() => removeSong(s.id)}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PomodoroDraft {
  workMin?: number;
  breakMin?: number;
}

function PomodoroEdit({
  value,
  onChange,
}: {
  value: PomodoroDraft;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const work = value.workMin ?? 25;
  const brk = value.breakMin ?? 5;
  return (
    <div className="wcc-form">
      <label className="wcc-label">专注时长（分钟）</label>
      <input
        className="wcc-input"
        type="number"
        min={1}
        max={180}
        value={work}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange({ workMin: Number.isFinite(n) && n > 0 ? n : 1 });
        }}
      />
      <label className="wcc-label" style={{ marginTop: 12 }}>
        休息时长（分钟）
      </label>
      <input
        className="wcc-input"
        type="number"
        min={1}
        max={60}
        value={brk}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange({ breakMin: Number.isFinite(n) && n > 0 ? n : 1 });
        }}
      />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        经典配比 25 / 5，深度工作可尝试 50 / 10。
      </div>
    </div>
  );
}

const HITOKOTO_TYPES: { id: string; label: string }[] = [
  { id: "", label: "全部" },
  { id: "a", label: "动画" },
  { id: "b", label: "漫画" },
  { id: "c", label: "游戏" },
  { id: "d", label: "文学" },
  { id: "h", label: "影视" },
  { id: "i", label: "诗词" },
  { id: "k", label: "哲学" },
  { id: "l", label: "抖机灵" },
];

interface HitokotoDraft {
  type?: string;
}

function HitokotoEdit({
  value,
  onChange,
}: {
  value: HitokotoDraft;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const cur = value.type ?? "";
  return (
    <div className="wcc-form">
      <label className="wcc-label">来源类别</label>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
      >
        {HITOKOTO_TYPES.map((t) => (
          <button
            key={t.id || "all"}
            className="wcc-btn-cancel"
            style={{
              background: cur === t.id ? "rgba(255,255,255,0.16)" : undefined,
              borderColor: cur === t.id ? "rgba(255,255,255,0.3)" : undefined,
            }}
            onClick={() => onChange({ type: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchEdit({
  value,
  onChange,
}: {
  value: { placeholder?: string };
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <div className="wcc-form">
      <label className="wcc-label">占位文字</label>
      <input
        className="wcc-input"
        placeholder="留空则使用默认：输入搜索内容"
        value={value.placeholder ?? ""}
        onChange={(e) => onChange({ placeholder: e.target.value })}
      />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        搜索引擎由全局偏好控制，点击磁贴左侧 logo 可切换。
      </div>
    </div>
  );
}
