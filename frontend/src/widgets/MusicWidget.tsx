import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { api } from "../api";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import type { WidgetProps } from "./types";

interface NeteaseSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  picUrl?: string;
  durationMs?: number;
}

interface MusicConfig {
  playlist?: NeteaseSong[];
  currentId?: number;
}

const DEFAULTS: MusicConfig = { playlist: [] };

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const MusicWidget = ({ w }: WidgetProps<MusicConfig> = {}) => {
  const { config, update } = useWidgetConfig<MusicConfig>(w, DEFAULTS);
  const playlist = config.playlist ?? [];
  const current = playlist.find((s) => s.id === config.currentId) ?? playlist[0];

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (current) {
      a.src = api.musicSongUrl(current.id);
      if (playing) a.play().catch(() => setPlaying(false));
    } else {
      a.removeAttribute("src");
      a.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const skip = (dir: 1 | -1) => {
    if (playlist.length === 0) return;
    const idx = playlist.findIndex((s) => s.id === current?.id);
    const next = playlist[(idx + dir + playlist.length) % playlist.length];
    update({ currentId: next.id });
    setPos(0);
    setPlaying(true);
  };

  if (!current) {
    return (
      <div className="widget w-music">
        <div className="widget-header">
          <span className="widget-title">音乐</span>
          <span className="muted mono" style={{ fontSize: 10 }}>空</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          通过右键菜单的"编辑"搜索并添加歌曲。
        </div>
      </div>
    );
  }

  const progress = dur > 0 ? (pos / dur) * 100 : 0;

  return (
    <div className="widget w-music">
      <div className="widget-header">
        <span className="widget-title">正在播放</span>
        <span className="muted mono" style={{ fontSize: 10 }}>NETEASE</span>
      </div>
      <div className="mrow">
        <div
          className="art"
          style={
            current.picUrl
              ? {
                  backgroundImage: `url(${current.picUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
        <div className="minfo">
          <div className="mtitle">{current.title}</div>
          <div className="martist">
            {current.artist}
            {current.album ? ` · ${current.album}` : ""}
          </div>
        </div>
      </div>
      <div className="prog"><div style={{ width: `${progress}%` }} /></div>
      <div className="ptime">
        <span>{fmt(pos)}</span>
        <span>-{fmt(Math.max(0, dur - pos))}</span>
      </div>
      <div className="ctrls">
        <button onClick={(e) => { e.stopPropagation(); skip(-1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="skip-prev" size={14} /></button>
        <button className="play" onClick={(e) => { e.stopPropagation(); toggle(); }} onMouseDown={(e) => e.stopPropagation()}>
          <Icon name={playing ? "pause" : "play-sm"} size={16} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); skip(1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="skip-next" size={14} /></button>
      </div>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDur(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => skip(1)}
      />
    </div>
  );
};

export const MusicDetail = ({ w }: WidgetProps<MusicConfig> = {}) => {
  const { config, update } = useWidgetConfig<MusicConfig>(w, DEFAULTS);
  const playlist = config.playlist ?? [];
  const current = playlist.find((s) => s.id === config.currentId) ?? playlist[0];
  const remove = (id: number) => {
    const next = playlist.filter((s) => s.id !== id);
    update({ playlist: next, currentId: config.currentId === id ? next[0]?.id : config.currentId });
  };
  const play = (id: number) => update({ currentId: id });
  if (playlist.length === 0) {
    return <div className="muted" style={{ fontSize: 13 }}>播放列表为空，请通过右键"编辑"搜索添加歌曲。</div>;
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {current && (
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 120, height: 120, borderRadius: 12, flex: "0 0 auto",
              background: current.picUrl
                ? `center / cover url(${current.picUrl})`
                : "rgba(255,255,255,0.06)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 11 }}>正在播放</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{current.title}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {current.artist}{current.album ? ` · ${current.album}` : ""}
            </div>
          </div>
        </div>
      )}
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>播放列表 · {playlist.length}</div>
        <div style={{ display: "grid", gap: 4, maxHeight: 300, overflowY: "auto" }}>
          {playlist.map((s, i) => {
            const active = s.id === current?.id;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                onClick={() => play(s.id)}
              >
                <span className="muted" style={{ fontSize: 11, width: 18, textAlign: "center" }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title} <span className="muted">— {s.artist}</span>
                </span>
                <button
                  className="wcc-btn-cancel"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                >移除</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
