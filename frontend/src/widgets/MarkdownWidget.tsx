import React, { useCallback, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { Icon } from "../components/Icon";
import { confirmDialog } from "../components/Dialogs";
import type { WidgetProps } from "./types";

interface Note {
  id: string;
  title: string;
  color: string;
  content: string;
  updatedAt: number;
}

interface MarkdownConfig {
  notes?: Note[];
  activeId?: string;
}

const DEFAULTS: MarkdownConfig = { notes: [], activeId: undefined };

const COLOR_PALETTE = [
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
];

function genId() {
  return "n_" + Math.random().toString(36).slice(2, 10);
}

function pickColor(notes: Note[]) {
  const used = new Set(notes.map((n) => n.color));
  const free = COLOR_PALETTE.find((c) => !used.has(c));
  return free ?? COLOR_PALETTE[notes.length % COLOR_PALETTE.length];
}

function deriveTitle(content: string, fallback = "未命名笔记") {
  const firstLine = content.split(/\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return fallback;
  return firstLine.replace(/^#{1,6}\s+/, "").replace(/[*_`>]/g, "").trim().slice(0, 32) || fallback;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function plainPreview(content: string, limit = 80) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "「代码」")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, limit);
}

// ===== TILE =====

export const MarkdownWidget = ({ w }: WidgetProps<MarkdownConfig> = {}) => {
  const { config } = useWidgetConfig<MarkdownConfig>(w, DEFAULTS);
  const notes = config.notes ?? [];
  const sorted = useMemo(
    () => [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [notes],
  );
  const visible = sorted.slice(0, 4);

  return (
    <div className="widget w-markdown-notes">
      <div className="widget-header">
        <span className="widget-title">笔记</span>
        <span className="muted mono" style={{ fontSize: 10 }}>
          {notes.length} 篇
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="md-notes-empty">
          <Icon name="edit" size={18} />
          <span>点击此处展开，开始第一条笔记</span>
        </div>
      ) : (
        <ul className="md-notes-list tile">
          {visible.map((n) => {
            const preview = plainPreview(n.content);
            const title = n.title || deriveTitle(n.content);
            return (
              <li key={n.id} className="md-note-row">
                <span className="md-note-accent" style={{ background: n.color }} />
                <div className="md-note-body">
                  <div className="md-note-title">{title}</div>
                  {preview && <div className="md-note-preview muted">{preview}</div>}
                </div>
                <span className="md-note-date muted mono">{formatDate(n.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ===== DETAIL =====

interface MilkdownEditorProps {
  initial: string;
  onChange: (md: string) => void;
}

const MilkdownEditor = ({ initial, onChange }: MilkdownEditorProps) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initial);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { class: "milkdown-root", spellcheck: "false" },
        }));
        ctx
          .get(listenerCtx)
          .markdownUpdated((_, md) => onChangeRef.current(md));
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener),
  );

  return (
    <div className="milkdown-wrap">
      <Milkdown />
    </div>
  );
};

export const MarkdownDetail = ({ w }: WidgetProps<MarkdownConfig> = {}) => {
  const { config, replace } = useWidgetConfig<MarkdownConfig>(w, DEFAULTS);
  const notes = config.notes ?? [];
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (n) =>
        (n.title || "").toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const activeId =
    config.activeId && notes.some((n) => n.id === config.activeId)
      ? config.activeId
      : sorted[0]?.id;
  const active = notes.find((n) => n.id === activeId);

  const commit = useCallback(
    (next: MarkdownConfig) => {
      replace({ ...config, ...next });
    },
    [config, replace],
  );

  const addNote = () => {
    const id = genId();
    const now = Date.now();
    const note: Note = {
      id,
      title: "",
      color: pickColor(notes),
      content: "",
      updatedAt: now,
    };
    commit({ notes: [note, ...notes], activeId: id });
  };

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    const nextActive =
      config.activeId === id ? next[0]?.id : config.activeId;
    commit({ notes: next, activeId: nextActive });
  };

  const setActive = (id: string) => {
    commit({ activeId: id });
  };

  const cycleColor = (id: string) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    const idx = COLOR_PALETTE.indexOf(n.color);
    const nextColor = COLOR_PALETTE[(idx + 1) % COLOR_PALETTE.length];
    commit({
      notes: notes.map((x) => (x.id === id ? { ...x, color: nextColor } : x)),
    });
  };

  const updateContent = useCallback(
    (md: string) => {
      if (!active) return;
      const title = deriveTitle(md, "");
      const next = notes.map((x) =>
        x.id === active.id
          ? { ...x, content: md, title, updatedAt: Date.now() }
          : x,
      );
      replace({ ...config, notes: next });
    },
    [active, notes, config, replace],
  );

  return (
    <div className="md-notes-detail">
      <aside className="md-notes-side">
        <div className="md-notes-side-top">
          <div className="md-notes-search">
            <Icon name="search" size={13} />
            <input
              type="text"
              placeholder="搜索笔记"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="md-notes-add" onClick={addNote} title="新建笔记">
            <Icon name="plus" size={14} />
          </button>
        </div>
        <ul className="md-notes-list detail">
          {filtered.length === 0 ? (
            <li className="md-notes-empty-side muted">
              {query ? "没有匹配的笔记" : "点击 + 新建笔记"}
            </li>
          ) : (
            filtered.map((n) => {
              const title = n.title || deriveTitle(n.content);
              const preview = plainPreview(n.content, 60);
              const isActive = n.id === activeId;
              return (
                <li
                  key={n.id}
                  className={"md-note-row" + (isActive ? " active" : "")}
                  onClick={() => setActive(n.id)}
                >
                  <button
                    className="md-note-accent-btn"
                    style={{ background: n.color }}
                    title="切换颜色"
                    onClick={(e) => {
                      e.stopPropagation();
                      cycleColor(n.id);
                    }}
                  />
                  <div className="md-note-body">
                    <div className="md-note-title">{title}</div>
                    <div className="md-note-sub muted">
                      <span>{formatDate(n.updatedAt)}</span>
                      {preview && <span className="md-note-dot">·</span>}
                      {preview && <span className="md-note-preview-inline">{preview}</span>}
                    </div>
                  </div>
                  <button
                    className="md-note-del"
                    title="删除笔记"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirmDialog(`删除「${title}」？`)) deleteNote(n.id);
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>
      <section className="md-notes-main">
        {active ? (
          <MilkdownProvider key={active.id}>
            <MilkdownEditor initial={DOMPurify.sanitize(active.content)} onChange={updateContent} />
          </MilkdownProvider>
        ) : (
          <div className="md-notes-placeholder muted">
            <Icon name="edit" size={28} />
            <div>选择左侧笔记开始编辑，或点击「+」新建一条。</div>
          </div>
        )}
      </section>
    </div>
  );
};
