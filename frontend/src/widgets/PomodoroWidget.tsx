import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "../components/Icon";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import type { WidgetProps } from "./types";

interface PomodoroConfig {
  workMin?: number;
  breakMin?: number;
}

const DEFAULTS: PomodoroConfig = { workMin: 25, breakMin: 5 };

type Phase = "work" | "break";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

class PomodoroStore {
  public listeners = new Set<() => void>();
  public state = { phase: "work" as Phase, remaining: 25 * 60, running: false, rounds: 0, workSec: 25 * 60, breakSec: 5 * 60 };
  private tickRef: number | null = null;

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
      const remaining = this.state.running ? this.state.remaining : (this.state.phase === "work" ? workSec : breakSec);
      this.setState({ workSec, breakSec, remaining });
    }
  }

  startTick() {
    if (this.tickRef !== null) return;
    this.tickRef = window.setInterval(() => {
      let r = this.state.remaining - 1;
      let p = this.state.phase;
      let rounds = this.state.rounds;

      if (r <= 0) {
        if (p === "work") rounds++;
        p = p === "work" ? "break" : "work";
        r = p === "work" ? this.state.workSec : this.state.breakSec;
        try {
            new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play().catch(() => {});
        } catch {}
      }
      this.setState({ remaining: r, phase: p, rounds });
    }, 1000);
  }

  stopTick() {
    if (this.tickRef !== null) {
      window.clearInterval(this.tickRef);
      this.tickRef = null;
    }
  }

  toggle = () => {
    const running = !this.state.running;
    this.setState({ running });
    if (running) this.startTick();
    else this.stopTick();
  };

  reset = () => {
    this.stopTick();
    this.setState({ running: false, phase: "work", remaining: this.state.workSec });
  };
}

const stores = new Map<string, PomodoroStore>();
function getStore(id: string) {
  if (!stores.has(id)) stores.set(id, new PomodoroStore());
  return stores.get(id)!;
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

  const total = state.phase === "work" ? state.workSec : state.breakSec;
  const progress = 1 - state.remaining / total;

  return (
    <div className="widget w-pomodoro">
      <div className="widget-header">
        <span className="widget-title">{state.phase === "work" ? "专注" : "休息"}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>第 {state.rounds + 1} 轮</span>
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
      <div style={{ marginTop: 12, height: 4, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: state.phase === "work" ? "#ff9b7b" : "#7bd88f", transition: "width 300ms ease" }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button
          className="wcc-btn-add"
          style={{ flex: 1, padding: "6px 10px" }}
          onClick={(e) => { e.stopPropagation(); store.toggle(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Icon name={state.running ? "pause" : "play-sm"} size={12} />
          <span style={{ marginLeft: 6 }}>{state.running ? "暂停" : "开始"}</span>
        </button>
        <button className="wcc-btn-cancel" style={{ padding: "6px 10px" }} onClick={(e) => { e.stopPropagation(); store.reset(); }} onMouseDown={(e) => e.stopPropagation()}>
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

  const total = state.phase === "work" ? state.workSec : state.breakSec;
  const progress = 1 - state.remaining / total;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 12 }}>{state.phase === "work" ? "专注中" : "休息中"} · 第 {state.rounds + 1} 轮</div>
        <div style={{ fontSize: 64, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", marginTop: 6, color: state.phase === "work" ? "inherit" : "#7bd88f" }}>{fmt(state.remaining)}</div>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: state.phase === "work" ? "#ff9b7b" : "#7bd88f", transition: "width 300ms" }} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button className="wcc-btn-add" style={{ padding: "10px 24px" }} onClick={() => store.toggle()}>
          <Icon name={state.running ? "pause" : "play-sm"} size={14} />
          <span style={{ marginLeft: 8 }}>{state.running ? "暂停" : "开始"}</span>
        </button>
        <button className="wcc-btn-cancel" style={{ padding: "10px 24px" }} onClick={() => store.reset()}>重置</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10, textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 11 }}>专注时长</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{workMin} 分钟</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10, textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 11 }}>休息时长</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{breakMin} 分钟</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10, textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 11 }}>本次完成</div>
          <div style={{ fontSize: 18, marginTop: 4 }}>{state.rounds} 轮</div>
        </div>
      </div>
    </div>
  );
};
