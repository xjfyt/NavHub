import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { toast } from "sonner";
import { confirmDialog, promptDialog } from "../Dialogs";
import { Icon } from "../Icon";
import type { WallpaperSourceView, AdminRemoteWallpaper } from "../../types";

interface ScraperConfig {
  label: string;
  defaultUrl: string;
  defaultBatch: number;
  maxBatch?: number;
  batchHint?: string;
  keyParam?: string;
  keyRequired?: boolean;
  keyHint?: string;
}

const SCRAPER_CONFIGS: Record<string, ScraperConfig> = {
  bing: {
    label: "Bing 每日壁纸",
    defaultUrl: "https://www.bing.com/HPImageArchive.aspx?format=js&n=8&mkt=zh-CN",
    defaultBatch: 15,
    maxBatch: 50,
    batchHint: "Bing 公开接口单次最多返回 8 张，历史窗口较短；系统会翻页去重，超过公开窗口后会自动停止。",
  },
  nasa: {
    label: "NASA 图库",
    defaultUrl: "https://images-api.nasa.gov/search?q=earth&media_type=image&page_size=20",
    defaultBatch: 20,
  },
  wikimedia: {
    label: "Wikimedia Commons",
    defaultUrl:
      "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Featured_pictures_on_Wikimedia_Commons&cmtype=file&cmlimit=30&format=json",
    defaultBatch: 30,
  },
  unsplash: {
    label: "Unsplash",
    defaultUrl: "https://api.unsplash.com/photos?per_page=30&order_by=popular",
    defaultBatch: 30,
    keyParam: "client_id",
    keyRequired: true,
    keyHint: "前往 unsplash.com/developers 创建应用，复制 Access Key 填入此处（不是 Secret Key —— Secret Key 仅用于 OAuth 用户授权，抓取壁纸不需要）",
  },
  wallhaven: {
    label: "Wallhaven",
    defaultUrl:
      "https://wallhaven.cc/api/v1/search?purity=100&categories=110&sorting=hot&atleast=1920x1080",
    defaultBatch: 24,
    keyParam: "apikey",
    keyRequired: false,
    keyHint: "可选，登录 wallhaven.cc → 设置 → API Key（可提升速率限制）",
  },
  pexels: {
    label: "Pexels 高质量风景",
    defaultUrl:
      "https://api.pexels.com/v1/search?query=nature%20landscape%20scenic%20mountains%20ocean%20forest%20waterfall&orientation=landscape&size=large&per_page=80",
    defaultBatch: 30,
    keyParam: "api_key",
    keyRequired: true,
    batchHint: "后端会额外过滤低分辨率、非横屏、低饱和黑白图和人物/人像类素材；Pexels API 每页最多 80 张候选。",
    keyHint: "前往 pexels.com/api 注册，获取免费 API Key。默认查询偏自然风景，可在 API 地址里调整 query。",
  },
  pixabay: {
    label: "Pixabay",
    defaultUrl:
      "https://pixabay.com/api/?category=nature&min_width=1920&per_page=30&order=popular",
    defaultBatch: 30,
    keyParam: "key",
    keyRequired: true,
    keyHint: "前往 pixabay.com/api/docs 注册，获取免费 API Key",
  },
  desktophut: {
    label: "Desktop Hut",
    defaultUrl: "https://www.desktophut.com",
    defaultBatch: 15,
  },
};

function extractKeyFromUrl(url: string, param: string): string {
  try {
    return new URL(url).searchParams.get(param) ?? "";
  } catch {
    return "";
  }
}

function stripKeyFromUrl(url: string, param: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete(param);
    return u.toString();
  } catch {
    return url;
  }
}

function injectKeyIntoUrl(url: string, param: string, key: string): string {
  if (!key.trim()) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(param, key.trim());
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${param}=${encodeURIComponent(key.trim())}`;
  }
}

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
  apiKey: string;
  enabled: boolean;
  fetchBatchSize: number;
  cacheTtlHours: number;
  fetchIntervalHours: number;
  sourceType: string;
  scraperType: string;
}

const defaultForm = (): SourceFormState => ({
  name: "",
  siteUrl: SCRAPER_CONFIGS.bing.defaultUrl,
  apiKey: "",
  enabled: true,
  fetchBatchSize: SCRAPER_CONFIGS.bing.defaultBatch,
  cacheTtlHours: 168,
  fetchIntervalHours: 24,
  sourceType: "image",
  scraperType: "bing",
});

export const AdminWallpaperLibrary = () => {
  const [sources, setSources] = useState<WallpaperSourceView[]>([]);
  const [wallpapers, setWallpapers] = useState<AdminRemoteWallpaper[]>([]);
  const [wallpaperTotal, setWallpaperTotal] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingWallpapers, setLoadingWallpapers] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SourceFormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [wallpaperPage, setWallpaperPage] = useState(0);
  const [detailWallpaper, setDetailWallpaper] = useState<AdminRemoteWallpaper | null>(null);
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
      setWallpapers(data.items);
      setWallpaperTotal(data.total);
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
    if (!(await confirmDialog("确定删除该壁纸来源？关联的壁纸也会一并删除。"))) return;
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
    if (!(await confirmDialog("确定删除该壁纸吗？操作不可撤销。"))) return;
    try {
      await api.admin.deleteRemoteWallpaper(id);
      setWallpapers((prev) => prev.filter((w) => w.id !== id));
      setWallpaperTotal((t) => Math.max(0, t - 1));
      setDetailWallpaper(null);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleRenameWallpaper = async (w: AdminRemoteWallpaper) => {
    const next = await promptDialog("修改壁纸名称：", w.title ?? "", "重命名壁纸");
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      toast.error("名称不能为空");
      return;
    }
    try {
      const updated = await api.admin.updateRemoteWallpaper(w.id, { title: trimmed });
      setWallpapers((prev) => prev.map((it) => (it.id === w.id ? updated : it)));
      setDetailWallpaper(updated);
      toast.success("已更新");
    } catch {
      toast.error("更新失败");
    }
  };

  const sourceNameOf = (sid: string) => sources.find((s) => s.id === sid)?.name ?? "未知来源";

  const formatBytes = (n: number | null | undefined) => {
    if (!n || n <= 0) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  const openEditForm = (source: WallpaperSourceView) => {
    setEditingId(source.id);
    const config = SCRAPER_CONFIGS[source.scraperType];
    const apiKey = config?.keyParam ? extractKeyFromUrl(source.siteUrl, config.keyParam) : "";
    const siteUrl = config?.keyParam ? stripKeyFromUrl(source.siteUrl, config.keyParam) : source.siteUrl;
    setForm({
      name: source.name,
      siteUrl,
      apiKey,
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
    const config = SCRAPER_CONFIGS[form.scraperType];
    if (config?.keyRequired && !form.apiKey.trim()) {
      toast.error(`${config.label} 需要填写 API Key`);
      return;
    }
    // Inject API key into URL before saving
    let siteUrl = form.siteUrl;
    if (config?.keyParam && form.apiKey.trim()) {
      siteUrl = injectKeyIntoUrl(siteUrl, config.keyParam, form.apiKey);
    }
    const payload = { ...form, siteUrl };
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await api.admin.updateWallpaperSource(editingId, payload);
        setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success("已更新");
      } else {
        const created = await api.admin.createWallpaperSource(payload);
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

  const editingSource = editingId ? sources.find((s) => s.id === editingId) : null;

  if (showAddForm) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => { setShowAddForm(false); setEditingId(null); }}
            style={{
              background: "var(--admin-border-str)", border: "none",
              width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text)",
            }}
            title="返回列表"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {editingId ? "编辑壁纸来源" : "添加壁纸来源"}
            </h2>
            {editingSource ? (
              <p style={{ fontSize: 13, color: "var(--text-soft)", display: "flex", alignItems: "center", gap: 8 }}>
                正在编辑：<span style={{ color: "var(--text)", fontWeight: 500 }}>{editingSource.name}</span>
                <span style={{ fontSize: 11, background: "var(--admin-border-str)", padding: "2px 6px", borderRadius: 4 }}>
                  {editingSource.scraperType}
                </span>
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-soft)" }}>选择爬虫类型并填写参数，保存后立即生效。</p>
            )}
          </div>
        </div>

        <div
          style={{
            background: "var(--admin-border-soft)",
            border: "1px solid var(--admin-border-str)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <form onSubmit={handleSubmitForm}>
            {/* Row 1: scraper type + name */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "0 20px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-soft)", marginBottom: 4 }}>壁纸来源</label>
                <select
                  value={form.scraperType}
                  onChange={(e) => {
                    const t = e.target.value;
                    const cfg = SCRAPER_CONFIGS[t];
                    setForm((f) => ({
                      ...f,
                      scraperType: t,
                      siteUrl: cfg?.defaultUrl ?? f.siteUrl,
                      apiKey: "",
                      fetchBatchSize: cfg?.defaultBatch ?? f.fetchBatchSize,
                      name: f.name || cfg?.label || f.name,
                    }));
                  }}
                  style={{
                    width: "100%", padding: "6px 10px",
                    background: "var(--admin-bg)", border: "1px solid var(--admin-border-str)",
                    borderRadius: 6, color: "var(--text)", fontSize: 13,
                  }}
                >
                  {Object.entries(SCRAPER_CONFIGS).map(([id, cfg]) => (
                    <option key={id} value={id}>{cfg.label}</option>
                  ))}
                </select>
              </div>
              {formField("名称", "name", "text", { placeholder: "自定义来源名称" })}
            </div>

            {/* API Key field — shown only for scrapers that support it */}
            {SCRAPER_CONFIGS[form.scraperType]?.keyParam && (() => {
              const cfg = SCRAPER_CONFIGS[form.scraperType];
              return (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, color: "var(--text-soft)", marginBottom: 4 }}>
                    API Key{cfg.keyRequired ? <span style={{ color: "#ff6b6b" }}> *</span> : <span style={{ color: "var(--text-soft)" }}> (可选)</span>}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={form.apiKey}
                      onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder={cfg.keyRequired ? "请填写 API Key" : "留空则跳过认证"}
                      autoComplete="off"
                      style={{
                        width: "100%", padding: "6px 36px 6px 10px",
                        background: "var(--admin-bg)", border: `1px solid ${cfg.keyRequired && !form.apiKey ? "rgba(255,107,107,0.4)" : "var(--admin-border-str)"}`,
                        borderRadius: 6, color: "var(--text)", fontSize: 13, boxSizing: "border-box",
                        fontFamily: form.apiKey ? "monospace" : "inherit",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      title={showApiKey ? "隐藏密钥" : "显示密钥"}
                      style={{
                        position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                        background: "transparent", border: "none", cursor: "pointer",
                        color: "var(--text-soft)", padding: 4, display: "flex", alignItems: "center",
                      }}
                    >
                      <Icon name={showApiKey ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                  {cfg.keyHint && (
                    <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4 }}>
                      {cfg.keyHint}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* API URL */}
            {formField("API 地址", "siteUrl", "text", { placeholder: "https://..." })}

            {/* Numeric params */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
              {formField("单次抓取数量", "fetchBatchSize", "number", { min: 1, max: SCRAPER_CONFIGS[form.scraperType]?.maxBatch ?? 50 })}
              {formField("缓存时长 (小时)", "cacheTtlHours", "number", { min: 1 })}
              {formField("抓取间隔 (小时)", "fetchIntervalHours", "number", { min: 1 })}
            </div>
            {SCRAPER_CONFIGS[form.scraperType]?.batchHint && (
              <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: -8, marginBottom: 14 }}>
                {SCRAPER_CONFIGS[form.scraperType].batchHint}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
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
      </div>
    );
  }

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

      {/* Sources table */}
      <div style={{ background: "var(--admin-border-soft)", borderRadius: 12, overflow: "hidden", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["名称", "类型", "批次", "缓存(h)", "间隔(h)", "已抓取", "最后抓取", "状态", "操作"].map((h) => (
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
                style={{ background: selectedSourceId === src.id ? "var(--admin-border-str)" : "transparent" }}
              >
                <td style={cell}>
                  <a
                    href={(() => { try { const u = new URL(src.siteUrl); return `${u.protocol}//${u.hostname}`; } catch { return src.siteUrl; } })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 500, color: "var(--text)", textDecoration: "none" }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                  >
                    {src.name}
                  </a>
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
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>已缓存壁纸</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="admin-wp-source-filter" style={{ fontSize: 12, color: "var(--text-soft)" }}>来源筛选</label>
          <select
            id="admin-wp-source-filter"
            value={selectedSourceId ?? ""}
            onChange={(e) => { setSelectedSourceId(e.target.value || null); setWallpaperPage(0); }}
            style={{
              padding: "5px 10px", fontSize: 12, borderRadius: 6,
              background: "var(--admin-bg)", border: "1px solid var(--admin-border-str)",
              color: "var(--text)", cursor: "pointer", minWidth: 140,
            }}
          >
            <option value="">全部来源（{wallpaperTotal} 张）</option>
            {sources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name} · {src.totalFetched} 张
              </option>
            ))}
          </select>
        </div>
      </div>

      <style>{`
        .wallpaper-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (min-width: 1300px) {
          .wallpaper-grid {
            grid-template-columns: repeat(6, 1fr);
          }
        }
        @media (min-width: 1700px) {
          .wallpaper-grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
      `}</style>

      {loadingWallpapers ? (
        <EmptyCell text="加载中..." />
      ) : wallpapers.length === 0 ? (
        <EmptyCell text="暂无壁纸。选择来源并点击「立即抓取」开始下载。" />
      ) : (
        <div className="wallpaper-grid">
          {wallpapers.map((w) => (
            <div
              key={w.id}
              onClick={() => setDetailWallpaper(w)}
              style={{
                background: "var(--admin-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
                position: "relative",
                border: "1px solid var(--admin-border-str)",
                cursor: "pointer",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              {w.thumbnailUrl || w.thumbnailKey || w.storageKey ? (
                <img
                  src={w.thumbnailKey ? `/uploads/${w.thumbnailKey}` : w.mediaType === "image" && w.storageKey ? `/uploads/${w.storageKey}` : w.thumbnailUrl ?? undefined}
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
                  <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.author}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {wallpaperTotal > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(wallpaperTotal / PAGE_SIZE));
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 20 }}>
            <button
              disabled={wallpaperPage === 0}
              onClick={() => setWallpaperPage((p) => Math.max(0, p - 1))}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: wallpaperPage === 0 ? 0.4 : 1 }}
            >
              上一页
            </button>
            <span style={{ lineHeight: "30px", fontSize: 13, color: "var(--text-soft)" }}>
              第 {wallpaperPage + 1} / {totalPages} 页 · 共 {wallpaperTotal} 张
            </span>
            <button
              disabled={wallpaperPage + 1 >= totalPages}
              onClick={() => setWallpaperPage((p) => p + 1)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--admin-border-soft)", border: "1px solid var(--admin-border-str)", borderRadius: 6, color: "var(--text)", opacity: wallpaperPage + 1 >= totalPages ? 0.4 : 1 }}
            >
              下一页
            </button>
          </div>
        );
      })()}

      {/* Detail modal */}
      {detailWallpaper && (
        <div
          onClick={() => setDetailWallpaper(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--admin-card-bg, var(--admin-bg))",
              border: "1px solid var(--admin-border-str)",
              borderRadius: 14, width: "min(560px, 100%)", maxHeight: "calc(100vh - 48px)",
              overflow: "auto", display: "flex", flexDirection: "column",
            }}
          >
            {detailWallpaper.thumbnailUrl || detailWallpaper.thumbnailKey || detailWallpaper.storageKey ? (
              <img
                src={detailWallpaper.thumbnailKey ? `/uploads/${detailWallpaper.thumbnailKey}` : detailWallpaper.mediaType === "image" && detailWallpaper.storageKey ? `/uploads/${detailWallpaper.storageKey}` : detailWallpaper.thumbnailUrl ?? undefined}
                alt={detailWallpaper.title ?? ""}
                style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{
                width: "100%", height: 200,
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-soft)",
              }}>
                {detailWallpaper.mediaType === "video" ? "🎬 视频" : "🖼 图片"}
              </div>
            )}
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, wordBreak: "break-word" }}>
                {detailWallpaper.title ?? "未命名壁纸"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 16 }}>
                {sourceNameOf(detailWallpaper.sourceId)} · {detailWallpaper.mediaType === "video" ? "动态壁纸" : "静态壁纸"}
                {detailWallpaper.author ? ` · ${detailWallpaper.author}` : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 8, columnGap: 14, fontSize: 12 }}>
                <div style={{ color: "var(--text-soft)" }}>文件大小</div>
                <div>{formatBytes(detailWallpaper.fileSizeBytes)}</div>
                <div style={{ color: "var(--text-soft)" }}>抓取时间</div>
                <div>{new Date(detailWallpaper.fetchedAt).toLocaleString("zh-CN")}</div>
                <div style={{ color: "var(--text-soft)" }}>原始链接</div>
                <div style={{ wordBreak: "break-all" }}>
                  <a href={detailWallpaper.originalUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    {detailWallpaper.originalUrl}
                  </a>
                </div>
                {detailWallpaper.pageUrl && (
                  <>
                    <div style={{ color: "var(--text-soft)" }}>来源页</div>
                    <div style={{ wordBreak: "break-all" }}>
                      <a href={detailWallpaper.pageUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        {detailWallpaper.pageUrl}
                      </a>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  onClick={() => setDetailWallpaper(null)}
                  style={{ padding: "7px 14px", fontSize: 13, background: "transparent", border: "1px solid var(--admin-border-str)", borderRadius: 8, color: "var(--text)", cursor: "pointer" }}
                >
                  关闭
                </button>
                <button
                  onClick={() => handleRenameWallpaper(detailWallpaper)}
                  style={{ padding: "7px 14px", fontSize: 13, background: "var(--admin-border-str)", border: "none", borderRadius: 8, color: "var(--text)", cursor: "pointer" }}
                >
                  重命名
                </button>
                <button
                  onClick={() => handleDeleteWallpaper(detailWallpaper.id)}
                  style={{ padding: "7px 14px", fontSize: 13, background: "rgba(255,90,90,0.15)", border: "none", borderRadius: 8, color: "#ff6b6b", cursor: "pointer", fontWeight: 600 }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
