import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { api } from "../api";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { cycleLoopMode, fmtTime, nextIndex, seekTime, type LoopMode } from "./musicMath";
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
  /** WIDGET-4: 循环模式与音量持久化到 config。 */
  loop?: LoopMode;
  volume?: number;
}

const DEFAULTS: MusicConfig = { playlist: [], loop: "all", volume: 1 };

const LOOP_ICON: Record<LoopMode, string> = {
  none: "repeat",
  all: "repeat",
  one: "repeat-one",
};
const LOOP_LABEL: Record<LoopMode, string> = {
  none: "顺序播放",
  all: "列表循环",
  one: "单曲循环",
};

export const MusicWidget = ({ w }: WidgetProps<MusicConfig> = {}) => {
  const { config, update } = useWidgetConfig<MusicConfig>(w, DEFAULTS);
  const playlist = config.playlist ?? [];
  const current = playlist.find((s) => s.id === config.currentId) ?? playlist[0];
  const loop: LoopMode = config.loop ?? "all";
  const volume = config.volume ?? 1;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [seeking, setSeeking] = useState(false);
  // FE-6: 用 ref 镜像最新 playing,避免 [current?.id] 这个 effect 捕获到
  // 过期的 playing 闭包值(切歌时按旧的播放状态决定是否自动播放)。
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // 循环模式同样用 ref 镜像,供 onEnded 回调读取最新值,避免过期闭包。
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (current) {
      a.src = api.musicSongUrl(current.id);
      // WIDGET-4(a): 切歌后按当前播放状态决定是否自动播放。
      if (playingRef.current) a.play().catch(() => setPlaying(false));
    } else {
      a.removeAttribute("src");
      a.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // WIDGET-4(c): 音量同步到 <audio>。
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

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

  // WIDGET-4(a): 手动切歌 —— natural=false,loop-one 也照常前进/绕回。
  const skip = (dir: 1 | -1) => {
    if (playlist.length === 0) return;
    const idx = playlist.findIndex((s) => s.id === current?.id);
    const ni = nextIndex(idx, dir, playlist.length, loop, false);
    if (ni === null) return;
    update({ currentId: playlist[ni].id });
    setPos(0);
    setPlaying(true);
  };

  // WIDGET-4(a): 自然播放结束 —— natural=true,loop-one 重播本曲,no-loop 到尾停止。
  const onEnded = () => {
    if (playlist.length === 0) return;
    const idx = playlist.findIndex((s) => s.id === current?.id);
    const m = loopRef.current;
    const ni = nextIndex(idx, 1, playlist.length, m, true);
    if (ni === null) {
      setPlaying(false);
      return;
    }
    const a = audioRef.current;
    if (m === "one" && ni === idx && a) {
      // 单曲循环:重头播放当前曲,无需切 src。
      a.currentTime = 0;
      a.play().catch(() => setPlaying(false));
      setPos(0);
      return;
    }
    update({ currentId: playlist[ni].id });
    setPos(0);
    setPlaying(true);
  };

  // WIDGET-4(b): 进度条点击/拖拽跳转。
  const seekFromClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const t = seekTime(ratio, dur);
    const a = audioRef.current;
    if (a && Number.isFinite(t)) {
      a.currentTime = t;
      setPos(t);
    }
  };

  const onProgPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (dur <= 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setSeeking(true);
    seekFromClientX(e.clientX, el);
  };
  const onProgPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seeking) return;
    seekFromClientX(e.clientX, e.currentTarget);
  };
  const onProgPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seeking) return;
    setSeeking(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const toggleLoop = () => update({ loop: cycleLoopMode(loop) });
  const setVolume = (v: number) => update({ volume: Math.min(1, Math.max(0, v)) });

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
        <button
          title={LOOP_LABEL[loop]}
          onClick={(e) => { e.stopPropagation(); toggleLoop(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, color: loop === "none" ? "var(--text-mute)" : "#fff",
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <Icon name={LOOP_ICON[loop]} size={12} />
          {loop === "one" && <span style={{ fontSize: 9 }}>1</span>}
        </button>
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
      <div
        className="prog"
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(pos)}
        style={{ cursor: dur > 0 ? "pointer" : "default", touchAction: "none" }}
        onPointerDown={onProgPointerDown}
        onPointerMove={onProgPointerMove}
        onPointerUp={onProgPointerUp}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ width: `${progress}%`, transition: seeking ? "none" : undefined }} />
      </div>
      <div className="ptime">
        <span>{fmtTime(pos)}</span>
        <span>-{fmtTime(Math.max(0, dur - pos))}</span>
      </div>
      <div className="ctrls">
        <button onClick={(e) => { e.stopPropagation(); skip(-1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="skip-prev" size={14} /></button>
        <button className="play" onClick={(e) => { e.stopPropagation(); toggle(); }} onMouseDown={(e) => e.stopPropagation()}>
          <Icon name={playing ? "pause" : "play-sm"} size={16} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); skip(1); }} onMouseDown={(e) => e.stopPropagation()}><Icon name="skip-next" size={14} /></button>
      </div>
      {/* WIDGET-4(c): 音量控制 */}
      <div className="mvol" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <Icon name={volume === 0 ? "volume-x" : "volume"} size={12} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="音量"
          style={{ flex: 1, accentColor: "#fff" }}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => { if (!seeking) setPos(e.currentTarget.currentTime); }}
        onDurationChange={(e) => setDur(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
      />
    </div>
  );
};

export const MusicDetail = ({ w }: WidgetProps<MusicConfig> = {}) => {
  const { config, update } = useWidgetConfig<MusicConfig>(w, DEFAULTS);
  const playlist = config.playlist ?? [];
  const current = playlist.find((s) => s.id === config.currentId) ?? playlist[0];
  const loop: LoopMode = config.loop ?? "all";
  const remove = (id: number) => {
    const next = playlist.filter((s) => s.id !== id);
    update({ playlist: next, currentId: config.currentId === id ? next[0]?.id : config.currentId });
  };
  const play = (id: number) => update({ currentId: id });
  const toggleLoop = () => update({ loop: cycleLoopMode(loop) });
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="muted" style={{ fontSize: 11 }}>正在播放</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{current.title}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {current.artist}{current.album ? ` · ${current.album}` : ""}
            </div>
            <button
              className="wcc-btn-cancel"
              style={{ marginTop: 10, padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={toggleLoop}
            >
              <Icon name={LOOP_ICON[loop]} size={12} />
              {LOOP_LABEL[loop]}
            </button>
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
