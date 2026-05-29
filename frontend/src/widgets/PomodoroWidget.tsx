import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "../components/Icon";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { advancePhase, remainingSeconds, type Phase } from "./pomodoroMath";
import type { WidgetProps } from "./types";

interface PomodoroConfig {
  workMin?: number;
  breakMin?: number;
}

const DEFAULTS: PomodoroConfig = { workMin: 25, breakMin: 5 };

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// WIDGET-3: 真实提示音 —— 用 Web Audio 合成一段短促双音“叮”,不引入任何外部资源。
// 浏览器自动播放策略要求 AudioContext 由用户手势创建/恢复,因此延迟到首次点击
// (toggle 是用户手势)时再创建,并在每次播放前 resume()。
let audioCtx: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** 在用户手势里预热音频上下文,绕过自动播放限制。 */
function primeAudio() {
  ensureAudioContext();
}

function playChime() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // 两声短音:880Hz → 1320Hz,带快速衰减包络,像一记轻快的“叮咚”。
    const tones = [
      { freq: 880, start: 0 },
      { freq: 1320, start: 0.16 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      const at = now + t.start;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  } catch {
    /* 忽略音频失败,不影响计时 */
  }
}

class PomodoroStore {
  public listeners = new Set<() => void>();
  // WIDGET-3: 计时改为时间戳驱动 —— endTs 为当前阶段的目标结束时刻;
  // running 时由 endTs 推导 remaining,后台节流也不漂移;暂停时冻结 remaining、endTs=null。
  public state = {
    phase: "work" as Phase,
    remaining: 25 * 60,
    running: false,
    rounds: 0,
    workSec: 25 * 60,
    breakSec: 5 * 60,
    endTs: null as number | null,
  };
  private tickRef: number | null = null;
  // FE-8: 引用计数,统计当前挂载的视图数(tile + detail 可同时存在)。
  private refCount = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  setState(partial: Partial<typeof this.state>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  syncConfig(workMin: number, breakMin: number) {
    const workSec = workMin * 60;
    const breakSec = breakMin * 60;
    if (this.state.workSec !== workSec || this.state.breakSec !== breakSec) {
      if (this.state.running && this.state.endTs !== null) {
        // 运行中改时长:仅更新缓存的阶段秒数,不打断当前这一段。
        this.setState({ workSec, breakSec });
      } else {
        const remaining = this.state.phase === "work" ? workSec : breakSec;
        this.setState({ workSec, breakSec, remaining, endTs: null });
      }
    }
  }

  /** 由当前 endTs 重新计算 remaining;到点则切换阶段并响铃。 */
  private tickFromClock() {
    if (this.state.endTs === null) return;
    const now = Date.now();
    const remaining = remainingSeconds(this.state.endTs, now);
    if (remaining > 0) {
      if (remaining !== this.state.remaining) this.setState({ remaining });
      return;
    }
    // 到点:切换阶段、记轮次、设新的结束时间戳,并播放真实提示音。
    const next = advancePhase(
      this.state.phase,
      { workSec: this.state.workSec, breakSec: this.state.breakSec },
      this.state.rounds,
      now,
    );
    playChime();
    this.setState({
      phase: next.phase,
      rounds: next.rounds,
      endTs: next.endTs,
      remaining: remainingSeconds(next.endTs, now),
    });
  }

  startTick() {
    if (this.tickRef !== null) return;
    // 用 250ms 轮询提升到点精度(避免 1s interval 错过整秒),
    // remaining 始终由时间戳推导,不累计漂移。
    this.tickRef = window.setInterval(() => this.tickFromClock(), 250);
  }

  stopTick() {
    if (this.tickRef !== null) {
      window.clearInterval(this.tickRef);
      this.tickRef = null;
    }
  }

  toggle = () => {
    // toggle 是用户手势 —— 借机预热/恢复 AudioContext,保证到点提示音能响。
    primeAudio();
    const running = !this.state.running;
    if (running) {
      const endTs = Date.now() + this.state.remaining * 1000;
      this.setState({ running: true, endTs });
      this.startTick();
    } else {
      // 暂停:把当前剩余冻结下来,清掉 endTs。
      const remaining =
        this.state.endTs !== null
          ? remainingSeconds(this.state.endTs, Date.now())
          : this.state.remaining;
      this.stopTick();
      this.setState({ running: false, remaining, endTs: null });
    }
  };

  reset = () => {
    this.stopTick();
    this.setState({
      running: false,
      phase: "work",
      remaining: this.state.workSec,
      endTs: null,
    });
  };

  // FE-8: 视图挂载时 retain,卸载时 release。最后一个视图卸载后停掉 interval
  // 并从 store 缓存中移除,避免计时器与 store 永久泄漏。
  private teardownRef: number | null = null;
  public onDispose: (() => void) | null = null;

  retain() {
    this.refCount++;
    // 取消任何待执行的延迟销毁(StrictMode 卸载→重挂 / tile↔detail 切换)。
    if (this.teardownRef !== null) {
      window.clearTimeout(this.teardownRef);
      this.teardownRef = null;
    }
  }

  release() {
    this.refCount--;
    if (this.refCount <= 0) {
      this.refCount = 0;
      // 延迟销毁:StrictMode 会同步卸载再重挂,tile↔detail 切换也会有短暂的
      // 0 引用窗口。延迟一拍后若仍无引用,才真正停表并释放 store。
      if (this.teardownRef !== null) window.clearTimeout(this.teardownRef);
      this.teardownRef = window.setTimeout(() => {
        this.teardownRef = null;
        if (this.refCount <= 0) {
          this.stopTick();
          this.onDispose?.();
        }
      }, 0);
    }
  }
}

const stores = new Map<string, PomodoroStore>();
function getStore(id: string) {
  let store = stores.get(id);
  if (!store) {
    store = new PomodoroStore();
    store.onDispose = () => stores.delete(id);
    stores.set(id, store);
  }
  return store;
}

export const PomodoroWidget = ({ w }: WidgetProps<PomodoroConfig> = {}) => {
  const { config } = useWidgetConfig<PomodoroConfig>(w, DEFAULTS);
  const workMin = Math.max(1, config.workMin ?? 25);
  const breakMin = Math.max(1, config.breakMin ?? 5);

  const storeId = w?.id || "default";
  const store = getStore(storeId);
  const state = useSyncExternalStore(store.subscribe, () => store.state);

  useEffect(() => {
    store.syncConfig(workMin, breakMin);
  }, [store, workMin, breakMin]);

  // FE-8: 挂载时 retain,卸载时 release —— 最后一个视图卸载后清理 interval 与 store。
  useEffect(() => {
    store.retain();
    return () => store.release();
  }, [store]);

  const total = state.phase === "work" ? state.workSec : state.breakSec;
  const progress = 1 - state.remaining / total;

  return (
    <div className="widget w-pomodoro">
      <div className="widget-header">
        <span className="widget-title">
          {state.phase === "work" ? "专注" : "休息"}
        </span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          第 {state.rounds + 1} 轮
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 40,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: state.phase === "work" ? "inherit" : "#7bd88f",
          }}
        >
          {fmt(state.remaining)}
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          height: 4,
          borderRadius: 3,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: state.phase === "work" ? "#ff9b7b" : "#7bd88f",
            transition: "width 300ms ease",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button
          className="wcc-btn-add"
          style={{ flex: 1, padding: "6px 10px" }}
          onClick={(e) => {
            e.stopPropagation();
            store.toggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Icon name={state.running ? "pause" : "play-sm"} size={12} />
          <span style={{ marginLeft: 6 }}>
            {state.running ? "暂停" : "开始"}
          </span>
        </button>
        <button
          className="wcc-btn-cancel"
          style={{ padding: "6px 10px" }}
          onClick={(e) => {
            e.stopPropagation();
            store.reset();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          重置
        </button>
      </div>
    </div>
  );
};

export const PomodoroDetail = ({ w }: WidgetProps<PomodoroConfig> = {}) => {
  const { config } = useWidgetConfig<PomodoroConfig>(w, DEFAULTS);
  const workMin = Math.max(1, config.workMin ?? 25);
  const breakMin = Math.max(1, config.breakMin ?? 5);

  const storeId = w?.id || "default";
  const store = getStore(storeId);
  const state = useSyncExternalStore(store.subscribe, () => store.state);

  useEffect(() => {
    store.syncConfig(workMin, breakMin);
  }, [store, workMin, breakMin]);

  // FE-8: 同 tile 视图,挂载 retain / 卸载 release,确保计时器与 store 不泄漏。
  useEffect(() => {
    store.retain();
    return () => store.release();
  }, [store]);

  const total = state.phase === "work" ? state.workSec : state.breakSec;
  const progress = 1 - state.remaining / total;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {state.phase === "work" ? "专注中" : "休息中"} · 第 {state.rounds + 1}{" "}
          轮
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
            marginTop: 6,
            color: state.phase === "work" ? "inherit" : "#7bd88f",
          }}
        >
          {fmt(state.remaining)}
        </div>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 4,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: state.phase === "work" ? "#ff9b7b" : "#7bd88f",
            transition: "width 300ms",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          className="wcc-btn-add"
          style={{ padding: "10px 24px" }}
          onClick={() => store.toggle()}
        >
          <Icon name={state.running ? "pause" : "play-sm"} size={14} />
          <span style={{ marginLeft: 8 }}>
            {state.running ? "暂停" : "开始"}
          </span>
        </button>
        <button
          className="wcc-btn-cancel"
          style={{ padding: "10px 24px" }}
          onClick={() => store.reset()}
        >
          重置
        </button>
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
            textAlign: "center",
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            专注时长
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{workMin} 分钟</div>
        </div>
        <div
          style={{
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            休息时长
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{breakMin} 分钟</div>
        </div>
        <div
          style={{
            padding: 10,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <div className="muted" style={{ fontSize: 11 }}>
            本次完成
          </div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{state.rounds} 轮</div>
        </div>
      </div>
    </div>
  );
};
