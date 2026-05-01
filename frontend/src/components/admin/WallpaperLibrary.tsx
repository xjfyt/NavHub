import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { toast } from "sonner";
import type { WallpaperSourceView, RemoteWallpaperItem } from "../../types";

const SCRAPER_TYPES = [
  { id: "bing", name: "Bing 每日壁纸" },
  { id: "nasa", name: "NASA 图库" },
  { id: "wikimedia", name: "Wikimedia Commons" },
  { id: "desktophut", name: "Desktop Hut" },
];

const SOURCE_TYPES = [
  { id: "image", name: "静态壁纸 (图片)" },
  { id: "video", name: "动态壁纸 (视频)" },
  { id: "both", name: "图文混合" },
];

const cell: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid var(--admin-border-soft)",
  verticalAlign: "middle",
};

const th: React.CSSProperties = {
  ...cell,
  fontWeight: 600,
  color: "var(--text-soft)",
  background: "var(--admin-border-soft)",
  whiteSpace: "nowrap",
};

const EmptyCell = ({ text }: { text?: string }) => (
  <div style={{ color: "var(--text-soft)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
    {text ?? "暂无数据"}
  </div>
);

interface SourceFormState {
  name: string;
  siteUrl: string;
  enabled: boolean;
  fetchBatchSize: number;
  cacheTtlHours: number;
  fetchIntervalHours: number;
  sourceType: string;
  scraperType: string;
}

const defaultForm = (): SourceFormState => ({
  name: "",
  siteUrl: "https://www.bing.com/HPImageArchive.aspx?format=js&n=8&mkt=zh-CN",
  enabled: true,
  fetchBatchSize: 15,
  cacheTtlHours: 168,
  fetchIntervalHours: 24,
  sourceType: "image",
  scraperType: "bing",
});

export const AdminWallpaperLibrary = () => {
  const [sources, setSources] = useState<WallpaperSourceView[]>([]);
  const [wallpapers, setWallpapers] = useState<RemoteWallpaperItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingWallpapers, setLoadingWallpapers] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SourceFormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [wallpaperPage, setWallpaperPage] = useState(0);
  const PAGE_SIZE = 24;

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const data = await api.admin.wallpaperSources();
      setSources(data);
    } catch {
      toast.error("加载壁纸来源失败");
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadWallpapers = useCallback(async (sourceId: string | null, page = 0) => {
    setLoadingWallpapers(true);
    try {
      const data = await api.admin.remoteWallpapers({
        sourceId: sourceId ?? undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setWallpapers(data);
    } catch {
      toast.error("加载壁纸列表失败");
    } finally {
      setLoadingWallpapers(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    loadWallpapers(selectedSourceId, wallpaperPage);
  }, [selectedSourceId, wallpaperPage, loadWallpapers]);

  const handleTriggerFetch = async (source: WallpaperSourceView) => {
    setFetching(source.id);
    try {
      await api.admin.triggerWallpaperFetch(source.id);
      toast.success(`已启动抓取任务：${source.name}`);
      setTimeout(() => {
        loadSources();
        loadWallpapers(selectedSourceId, wallpaperPage);
        setFetching(null);
      }, 3000);
    } catch {
      toast.error("启动抓取失败");
      setFetching(null);
    }
  };

  const handleToggleEnabled = async (source: WallpaperSourceView) => {
    try {
      const updated = await api.admin.updateWallpaperSource(source.id, {
        enabled: !source.enabled,
      });
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      toast.error("更新失败");
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm("确定删除该壁纸来源？关联的壁纸也会一并删除。")) return;
    try {
      await api.admin.deleteWallpaperSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
      if (selectedSourceId === id) setSelectedSourceId(null);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleDeleteWallpaper = async (id: string) => {
    try {
      await api.admin.deleteRemoteWallpaper(id);
      setWallpapers((prev) => prev.filter((w) => w.id !== id));
    } catch {
      toast.error("删除失败");
    }
  };

  const openEditForm = (source: WallpaperSourceView) => {
    setEditingId(source.id);
    setForm({
      name: source.name,
      siteUrl: source.siteUrl,
      enabled: source.enabled,
      fetchBatchSize: source.fetchBatchSize,
      cacheTtlHours: source.cacheTtlHours,
      fetchIntervalHours: source.fetchIntervalHours,
      sourceType: source.sourceType,
      scraperType: source.scraperType,
    });
    setShowAddForm(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.siteUrl.trim()) {
      toast.error("名称和地址不能为空");
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await api.admin.updateWallpaperSource(editingId, form);
        setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success("已更新");
      } else {
        const created = await api.admin.createWallpaperSource(form);
        setSources((prev) => [...prev, created]);
        toast.success("已添加来源");
      }
      setShowAddForm(false);
      setEditingId(null);
      setForm(defaultForm());
    } catch {
      toast.error(editingId ? "更新失败" : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  const formField = (
    label: string,
    field: keyof SourceFormState,
    type: "text" | "number" | "checkbox" = "text",
    extra?: React.InputHTMLAttributes<HTMLInputElement>
  ) => {
    const val = form[field];
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-soft)", marginBottom: 4 }}>
          {label}
        </label>
        {type === "checkbox" ? (
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.checked }))}
          />
        ) : (
          <input
            type={type}
            value={String(val)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [field]: type === "number" ? Number(e.target.value) : e.target.value,
              }))
            }
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "var(--admin-bg)",
              border: "1px solid var(--admin-border-str)",
              borderRadius: 6,
              color: "var(--text)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
            {...extra}
          />
        )}
      </div>
    );
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "从未";
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>壁纸库管理</h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
            配置壁纸抓取来源，系统会自动拉取并缓存到 MinIO，支持定时刷新。
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); setForm(defaultForm()); }}
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "var(--text-inv)",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + 添加来源
        </button>
      </div>

      {/* Add / Edit Form */}
      {showAddForm && (
        <div
          style={{
            background: "var(--admin-border-soft)",
            border: "1px solid var(--admin-border-str)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            {editingId ? "编辑来源" : "添加来源"}
          </h3>
          <form onSubmit={handleSubmitForm}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              {formField("名称", "name", "text", { placeholder: "Desktop Hut Live Wallpapers" })}
              {formField("抓取地址 (URL)", "siteUrl", "text", { placeholder: "https://www.desktophut.com" })}
              {formField("单次抓取数量", "fetchBatchSize", "number", { min: 1, max: 50 })}
              {formField("缓存时长 (小时)", "cacheTtlHours", "number", { min: 1 })}
              {formField("抓取间隔 (小时)", "fetchIntervalHours", "number", { min: 1 })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-soft)", marginBottom: 4 }}>爬虫类型</label>
                <select
                  value={form.scraperType}
                  onChange={(e) => setForm((f) => ({ ...f, scraperType: e.target.value }))}
                  style={{
                    width: "100%", padding: "6px 10px",
                    background: "var(--admin-bg)", border: "1px solid var(--admin-border-str)",
                    borderRadius: 6, color: "var(--text)", fontSize: 13,
                  }}
                >
                  {SCRAPER_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-soft)", marginBottom: 4 }}>媒体类型</label>
                <select
                  value={form.sourceType}
                  onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value }))}
                  style={{
                    width: "100%", padding: "6px 10px",
                    background: "var(--admin-bg)", border: "1px solid var(--admin-border-str)",
                    borderRadius: 6, color: "var(--text)", fontSize: 13,
                  }}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
                <input
                  type="checkbox"
                  id="enabled-chk"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                <label htmlFor="enabled-chk" style={{ fontSize: 13, cursor: "pointer" }}>启用自动抓取</label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setEditingId(null); }}
                style={{ padding: "7px 16px", background: "transparent", border: "1px solid var(--admin-border-str)", borderRadius: 8, color: "var(--text)", fontSize: 13, cursor: "pointer" }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: "7px 16px", background: "var(--accent)", color: "var(--text-inv)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sources table */}
      <div style={{ background: "var(--admin-border-soft)", borderRadius: 12, overflow: "hidden", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["名称 / 地址", "类型", "批次", "缓存(h)", "间隔(h)", "已抓取", "最后抓取", "状态", "操作"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingSources ? (
              <tr><td colSpan={9} style={cell}><EmptyCell text="加载中..." /></td></tr>
            ) : sources.length === 0 ? (
              <tr><td colSpan={9} style={cell}><EmptyCell text="暂无来源，点击「添加来源」开始" /></td></tr>
            ) : sources.map((src) => (
              <tr
                key={src.id}
                style={{ background: selectedSourceId === src.id ? "var(--admin-border-str)" : "transparent", cursor: "pointer" }}
                onClick={() => setSelectedSourceId(selectedSourceId === src.id ? null : src.id)}
              >
                <td style={cell}>
                  <div style={{ fontWeight: 500 }}>{src.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 2, wordBreak: "break-all" }}>{src.siteUrl}</div>
                </td>
                <td style={cell}><span style={{ fontSize: 11, background: "var(--admin-border-str)", padding: "2px 6px", borderRadius: 4 }}>{src.scraperType}</span></td>
                <td style={{ ...cell, textAlign: "center" }}>{src.fetchBatchSize}</td>
                <td style={{ ...cell, textAlign: "center" }}>{src.cacheTtlHours}</td>
                <td style={{ ...cell, textAlign: "center" }}>{src.fetchIntervalHours}</td>
                <td style={{ ...cell, textAlign: "center" }}>{src.totalFetched}</td>
                <td style={cell}>{formatDate(src.lastFetchedAt)}</td>
                <td style={cell}>
                  <span
                    onClick={(e) => { e.stopPropagation(); handleToggleEnabled(src); }}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: src.enabled ? "rgba(62,190,120,0.15)" : "rgba(150,150,150,0.1)",
                      color: src.enabled ? "#3ebe78" : "var(--text-soft)",
                    }}
                  >
                    {src.enabled ? "启用" : "停用"}
                  </span>
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleTriggerFetch(src)}
                    disabled={fetching === src.id}
                    style={{
                      marginRight: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
                      background: "var(--accent)", color: "var(--text-inv)", border: "none", borderRadius: 6,
                      opacity: fetching === src.id ? 0.6 : 1,
                    }}
                  >
                    {fetching === src.id ? "抓取中..." : "立即抓取"}
                  </button>
                  <button
                    onClick={() => openEditForm(src)}
                    style={{ marginRight: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", background: "transparent", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)" }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDeleteSource(src.id)}
                    style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", background: "rgba(255,90,90,0.1)", border: "none", borderRadius: 6, color: "#ff6b6b" }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wallpapers grid */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>
          已缓存壁纸
          {selectedSourceId && sources.find((s) => s.id === selectedSourceId) && (
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-soft)", marginLeft: 8 }}>
              · {sources.find((s) => s.id === selectedSourceId)?.name}
            </span>
          )}
        </h3>
        {selectedSourceId && (
          <button
            onClick={() => setSelectedSourceId(null)}
            style={{ fontSize: 12, color: "var(--text-soft)", background: "none", border: "none", cursor: "pointer" }}
          >
            显示全部
          </button>
        )}
      </div>

      {loadingWallpapers ? (
        <EmptyCell text="加载中..." />
      ) : wallpapers.length === 0 ? (
        <EmptyCell text="暂无壁纸。选择来源并点击「立即抓取」开始下载。" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {wallpapers.map((w) => (
            <div
              key={w.id}
              style={{
                background: "var(--admin-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
                position: "relative",
                border: "1px solid var(--admin-border-str)",
              }}
            >
              {w.thumbnailUrl ? (
                <img
                  src={w.thumbnailUrl}
                  alt={w.title ?? "wallpaper"}
                  style={{ width: "100%", height: 112, objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%", height: 112,
                    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-soft)", fontSize: 11,
                  }}
                >
                  {w.mediaType === "video" ? "🎬 视频" : "🖼 图片"}
                </div>
              )}

              {/* Video indicator badge */}
              {w.mediaType === "video" && (
                <div style={{
                  position: "absolute", top: 6, left: 6,
                  background: "rgba(0,0,0,0.65)", borderRadius: 4,
                  padding: "2px 6px", fontSize: 10, color: "#fff",
                }}>
                  VIDEO
                </div>
              )}

              <div style={{ padding: "8px 10px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.title ?? undefined}>
                  {w.title ?? "未命名壁纸"}
                </div>
                {w.author && (
                  <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 2 }}>{w.author}</div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {w.pageUrl && (
                    <a
                      href={w.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      来源
                    </a>
                  )}
                  <button
                    onClick={() => handleDeleteWallpaper(w.id)}
                    style={{ fontSize: 11, color: "#ff6b6b", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto" }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {wallpapers.length > 0 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
          <button
            disabled={wallpaperPage === 0}
            onClick={() => setWallpaperPage((p) => Math.max(0, p - 1))}
            style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: wallpaperPage === 0 ? 0.4 : 1 }}
          >
            上一页
          </button>
          <span style={{ lineHeight: "30px", fontSize: 13, color: "var(--text-soft)" }}>第 {wallpaperPage + 1} 页</span>
          <button
            disabled={wallpapers.length < PAGE_SIZE}
            onClick={() => setWallpaperPage((p) => p + 1)}
            style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: wallpapers.length < PAGE_SIZE ? 0.4 : 1 }}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};
