import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx, prosePluginsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { linkSanitizerPlugin } from "./markdownSanitize";
import { deriveTitle, formatDate, plainPreview, type Note } from "./markdownNote";
import { useWidgetConfig } from "../hooks/useWidgetConfig";
import { Icon } from "../components/Icon";
import { confirmDialog } from "../components/Dialogs";
import type { WidgetProps } from "./types";

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

// ===== TILE =====

/**
 * PERF-5: 磁贴单行。React.memo + 内部 useMemo 让 title/preview 仅在该条
 * 笔记内容变化时重算,而非整列每次渲染都对每条重算 plainPreview。
 */
const TileNoteRow = memo(function TileNoteRow({ note }: { note: Note }) {
  const title = useMemo(
    () => note.title || deriveTitle(note.content),
    [note.title, note.content],
  );
  const preview = useMemo(() => plainPreview(note.content), [note.content]);
  return (
    <li className="md-note-row">
      <span className="md-note-accent" style={{ background: note.color }} />
      <div className="md-note-body">
        <div className="md-note-title">{title}</div>
        {preview && <div className="md-note-preview muted">{preview}</div>}
      </div>
      <span className="md-note-date muted mono">{formatDate(note.updatedAt)}</span>
    </li>
  );
});

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
          {visible.map((n) => (
            <TileNoteRow key={n.id} note={n} />
          ))}
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
        // FE-2: 注册链接/图片清洗插件,过滤渲染输出中的危险 href/src(XSS)。
        ctx.update(prosePluginsCtx, (plugins) => [...plugins, linkSanitizerPlugin()]);
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

/**
 * PERF-5: 详情侧栏单行。memo + useMemo,只有该条内容/激活态变化时才重渲染、
 * 才重算 title/preview。回调以 id 形式上抛,父级回调引用保持稳定。
 */
interface SideNoteRowProps {
  note: Note;
  isActive: boolean;
  onSelect: (id: string) => void;
  onCycleColor: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}

const SideNoteRow = memo(function SideNoteRow({
  note,
  isActive,
  onSelect,
  onCycleColor,
  onDelete,
}: SideNoteRowProps) {
  const title = useMemo(
    () => note.title || deriveTitle(note.content),
    [note.title, note.content],
  );
  const preview = useMemo(() => plainPreview(note.content, 60), [note.content]);
  return (
    <li
      className={"md-note-row" + (isActive ? " active" : "")}
      onClick={() => onSelect(note.id)}
    >
      <button
        className="md-note-accent-btn"
        style={{ background: note.color }}
        title="切换颜色"
        onClick={(e) => {
          e.stopPropagation();
          onCycleColor(note.id);
        }}
      />
      <div className="md-note-body">
        <div className="md-note-title">{title}</div>
        <div className="md-note-sub muted">
          <span>{formatDate(note.updatedAt)}</span>
          {preview && <span className="md-note-dot">·</span>}
          {preview && <span className="md-note-preview-inline">{preview}</span>}
        </div>
      </div>
      <button
        className="md-note-del"
        title="删除笔记"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(note.id, title);
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </li>
  );
});

/**
 * PERF-5: 侧栏列表整体抽成 memo 组件。它只依赖 filtered/activeId 与一组
 * 稳定回调——编辑器输入引起的「无关」重渲染不会穿透到这里;反之列表交互
 * 也不重渲染编辑器(见 MarkdownDetail 里编辑器被独立隔离)。
 */
interface NoteSideListProps {
  filtered: Note[];
  activeId: string | undefined;
  query: string;
  onSelect: (id: string) => void;
  onCycleColor: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}

const NoteSideList = memo(function NoteSideList({
  filtered,
  activeId,
  query,
  onSelect,
  onCycleColor,
  onDelete,
}: NoteSideListProps) {
  return (
    <ul className="md-notes-list detail">
      {filtered.length === 0 ? (
        <li className="md-notes-empty-side muted">
          {query ? "没有匹配的笔记" : "点击 + 新建笔记"}
        </li>
      ) : (
        filtered.map((n) => (
          <SideNoteRow
            key={n.id}
            note={n}
            isActive={n.id === activeId}
            onSelect={onSelect}
            onCycleColor={onCycleColor}
            onDelete={onDelete}
          />
        ))
      )}
    </ul>
  );
});

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

  // 始终读取最新 config 的 ref,让下方回调引用保持稳定(不随 notes 变化重建),
  // 从而 memo 化的列表/行不会因父级回调身份变化而无谓重渲染。
  const configRef = useRef(config);
  configRef.current = config;

  const commit = useCallback(
    (next: MarkdownConfig) => {
      replace({ ...configRef.current, ...next });
    },
    [replace],
  );

  const addNote = useCallback(() => {
    const cur = configRef.current.notes ?? [];
    const id = genId();
    const now = Date.now();
    const note: Note = {
      id,
      title: "",
      color: pickColor(cur),
      content: "",
      updatedAt: now,
    };
    commit({ notes: [note, ...cur], activeId: id });
  }, [commit]);

  const deleteNote = useCallback(
    (id: string) => {
      const cur = configRef.current.notes ?? [];
      const next = cur.filter((n) => n.id !== id);
      const nextActive =
        configRef.current.activeId === id ? next[0]?.id : configRef.current.activeId;
      commit({ notes: next, activeId: nextActive });
    },
    [commit],
  );

  const setActive = useCallback(
    (id: string) => {
      commit({ activeId: id });
    },
    [commit],
  );

  const cycleColor = useCallback(
    (id: string) => {
      const cur = configRef.current.notes ?? [];
      const n = cur.find((x) => x.id === id);
      if (!n) return;
      const idx = COLOR_PALETTE.indexOf(n.color);
      const nextColor = COLOR_PALETTE[(idx + 1) % COLOR_PALETTE.length];
      commit({
        notes: cur.map((x) => (x.id === id ? { ...x, color: nextColor } : x)),
      });
    },
    [commit],
  );

  const confirmDelete = useCallback(
    async (id: string, title: string) => {
      if (await confirmDialog(`删除「${title}」？`, undefined, { danger: true })) {
        deleteNote(id);
      }
    },
    [deleteNote],
  );

  // UX-16 自动保存:编辑器每次 markdownUpdated 都把全文写回当前激活笔记。
  // 用 activeId(而非 active 对象)作为依赖,保证引用稳定、不在每次按键
  // 触发的 notes 变更后重建 onChange,从而不重挂编辑器。
  const updateContent = useCallback(
    (md: string) => {
      const cur = configRef.current;
      const curNotes = cur.notes ?? [];
      if (!activeId || !curNotes.some((x) => x.id === activeId)) return;
      const title = deriveTitle(md, "");
      const next = curNotes.map((x) =>
        x.id === activeId
          ? { ...x, content: md, title, updatedAt: Date.now() }
          : x,
      );
      replace({ ...cur, notes: next });
    },
    [activeId, replace],
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
        <NoteSideList
          filtered={filtered}
          activeId={activeId}
          query={query}
          onSelect={setActive}
          onCycleColor={cycleColor}
          onDelete={confirmDelete}
        />
      </aside>
      <section className="md-notes-main">
        {active ? (
          <MilkdownProvider key={active.id}>
            <MilkdownEditor initial={active.content} onChange={updateContent} />
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
