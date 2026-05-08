import { useState } from "react";
import { Icon } from "../components/Icon";
import type { WidgetProps } from "./types";
import { useWidgetConfig } from "../hooks/useWidgetConfig";

interface TodoItem {
  id: string;
  t: string;
  done: boolean;
}

interface TodoConfig {
  items: TodoItem[];
}

const DEFAULTS: TodoConfig = { items: [] };

export const TodoWidget = ({ w }: WidgetProps<TodoConfig> = {}) => {
  const { config, update } = useWidgetConfig<TodoConfig>(w, DEFAULTS);
  const [txt, setTxt] = useState("");
  const items = config.items ?? [];
  const add = () => {
    const v = txt.trim();
    if (!v) return;
    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : String(Date.now());
    update({ items: [...items, { id, t: v, done: false }] });
    setTxt("");
  };
  const toggle = (id: string) =>
    update({ items: items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });
  const remove = (id: string) =>
    update({ items: items.filter((i) => i.id !== id) });
  return (
    <div className="widget w-todo">
      <div className="widget-header">
        <span className="widget-title">待办 · {items.filter((i) => !i.done).length}</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {items.filter((i) => i.done).length}/{items.length}
        </span>
      </div>
      <div className="todo-list">
        {items.map((it) => (
          <div key={it.id} className={"todo-item" + (it.done ? " done" : "")}>
            <div
              className={"todo-check" + (it.done ? " done" : "")}
              onClick={(e) => { e.stopPropagation(); toggle(it.id); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <span
              className="txt"
              onDoubleClick={(e) => { e.stopPropagation(); remove(it.id); }}
              title="双击删除"
            >{it.t}</span>
          </div>
        ))}
      </div>
      <div className="todo-add">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder="添加一项…"
        />
        <button onClick={(e) => { e.stopPropagation(); add(); }} onMouseDown={(e) => e.stopPropagation()}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
};

export const TodoDetail = ({ w }: WidgetProps<TodoConfig> = {}) => {
  const { config, update } = useWidgetConfig<TodoConfig>(w, DEFAULTS);
  const items = config.items ?? [];
  const [txt, setTxt] = useState("");
  const doneCount = items.filter((i) => i.done).length;
  const add = () => {
    const v = txt.trim();
    if (!v) return;
    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now());
    update({ items: [...items, { id, t: v, done: false }] });
    setTxt("");
  };
  const toggle = (id: string) => update({ items: items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });
  const remove = (id: string) => update({ items: items.filter((i) => i.id !== id) });
  const clearDone = () => update({ items: items.filter((i) => !i.done) });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="添加一项…"
          style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "inherit" }}
        />
        <button onClick={add} className="wcc-btn-add" style={{ padding: "8px 14px" }}>添加</button>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>共 {items.length} 项 · 完成 {doneCount} · 剩余 {items.length - doneCount}</div>
      <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {items.length === 0 && <div className="muted" style={{ fontSize: 12 }}>还没有任何待办项。</div>}
        {items.map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
            <input type="checkbox" checked={it.done} onChange={() => toggle(it.id)} />
            <span style={{ flex: 1, textDecoration: it.done ? "line-through" : undefined, opacity: it.done ? 0.55 : 1 }}>{it.t}</span>
            <button className="wcc-btn-cancel" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => remove(it.id)}>删除</button>
          </div>
        ))}
      </div>
      {doneCount > 0 && (
        <button className="wcc-btn-cancel" onClick={clearDone} style={{ alignSelf: "flex-start" }}>清除已完成</button>
      )}
    </div>
  );
};
