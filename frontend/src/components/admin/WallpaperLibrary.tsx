import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import { toast } from "sonner";
import { confirmDialog, promptDialog } from "../Dialogs";
import { ContextMenu, type CtxItem, type CtxMenuState } from "../ContextMenu";
import { safeHttpUrl } from "../../utils/iconSources";
import type { WallpaperSourceView, AdminRemoteWallpaper } from "../../types";
import type {
  SourceFormState,
  UploadProgressState,
} from "./wallpaper-library/types";
import {
  SCRAPER_CONFIGS,
  PAGE_SIZE,
  defaultForm,
} from "./wallpaper-library/constants";
import {
  extractKeyFromUrl,
  stripKeyFromUrl,
  injectKeyIntoUrl,
} from "./wallpaper-library/helpers";
import { EmptyCell } from "./wallpaper-library/shared";
import { SourceForm } from "./wallpaper-library/SourceForm";
import { SourcesTable } from "./wallpaper-library/SourcesTable";
import { UploadProgressBar } from "./wallpaper-library/UploadProgressBar";
import { WallpaperCard } from "./wallpaper-library/WallpaperCard";
import { WallpaperDetailModal } from "./wallpaper-library/WallpaperDetailModal";

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
  const [detailWallpaper, setDetailWallpaper] =
    useState<AdminRemoteWallpaper | null>(null);
  const [uploadingTo, setUploadingTo] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetSourceRef = useRef<string | null>(null);

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

  const loadWallpapers = useCallback(
    async (sourceId: string | null, page = 0) => {
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
    },
    [],
  );

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    loadWallpapers(selectedSourceId, wallpaperPage);
  }, [selectedSourceId, wallpaperPage, loadWallpapers]);

  const handleTriggerFetch = async (source: WallpaperSourceView) => {
    setFetching(source.id);
    // UX-14: 后端 /fetch 是 fire-and-forget(返回 {status:"started"} 后台异步抓取),
    // 没有任务状态/进度接口可轮询。这里诚实地呈现「抓取中」并轮询来源的 totalFetched,
    // 在有限时间窗内观察新增数量;窗口结束时按观测到的已缓存增量给出反馈。
    const before = source.totalFetched ?? 0;
    let toastId: string | number | undefined;
    try {
      await api.admin.triggerWallpaperFetch(source.id);
      toastId = toast.loading(`正在抓取：${source.name}…`);
    } catch {
      toast.error("启动抓取失败");
      setFetching(null);
      return;
    }

    // 轮询源列表以观察已缓存数量变化(无真实进度接口,只能观测计数增量)。
    const POLL_INTERVAL = 3000;
    const MAX_POLLS = 6; // 最多约 18s
    let polls = 0;
    let lastTotal = before;
    let stableRounds = 0;
    const poll = async () => {
      polls += 1;
      try {
        const list = await api.admin.wallpaperSources();
        setSources(list);
        const cur = list.find((s) => s.id === source.id);
        const curTotal = cur?.totalFetched ?? lastTotal;
        if (curTotal === lastTotal) stableRounds += 1;
        else stableRounds = 0;
        lastTotal = curTotal;
        loadWallpapers(selectedSourceId, wallpaperPage);
      } catch {
        /* 忽略单次轮询失败,继续等待 */
      }
      // 计数连续两轮不变,或到达上限,则结束并汇报。
      if (stableRounds >= 2 || polls >= MAX_POLLS) {
        const delta = Math.max(0, lastTotal - before);
        if (toastId !== undefined) toast.dismiss(toastId);
        if (delta > 0) {
          toast.success(`抓取完成：新增 ${delta} 张壁纸`);
        } else if (polls >= MAX_POLLS) {
          toast.message("抓取仍在后台进行，暂未发现新增（可稍后刷新查看）");
        } else {
          toast.message("抓取完成：未发现新内容");
        }
        setFetching(null);
        return;
      }
      window.setTimeout(poll, POLL_INTERVAL);
    };
    window.setTimeout(poll, POLL_INTERVAL);
  };

  const handleToggleEnabled = async (source: WallpaperSourceView) => {
    try {
      const updated = await api.admin.updateWallpaperSource(source.id, {
        enabled: !source.enabled,
      });
      setSources((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
    } catch {
      toast.error("更新失败");
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (
      !(await confirmDialog(
        "确定删除该壁纸来源？关联的壁纸也会一并删除。",
        undefined,
        { danger: true },
      ))
    )
      return;
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
    if (
      !(await confirmDialog("确定删除该壁纸吗？操作不可撤销。", undefined, {
        danger: true,
      }))
    )
      return;
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
    const next = await promptDialog(
      "修改壁纸名称：",
      w.title ?? "",
      "重命名壁纸",
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      toast.error("名称不能为空");
      return;
    }
    try {
      const updated = await api.admin.updateRemoteWallpaper(w.id, {
        title: trimmed,
      });
      setWallpapers((prev) =>
        prev.map((it) => (it.id === w.id ? updated : it)),
      );
      setDetailWallpaper(updated);
      toast.success("已更新");
    } catch {
      toast.error("更新失败");
    }
  };

  const triggerUpload = (sourceId: string) => {
    uploadTargetSourceRef.current = sourceId;
    uploadInputRef.current?.click();
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // input.files 是对该 input 选区的实时引用——一旦下面把 value 清空，
    // 这个 FileList 会立刻变空，所以必须先快照成 File[] 再清空。
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    const sourceId = uploadTargetSourceRef.current;
    e.target.value = "";
    if (files.length === 0 || !sourceId) return;
    setUploadingTo(sourceId);
    try {
      let okCount = 0;
      let failCount = 0;
      const totalBytes = files.reduce(
        (sum, file) => sum + Math.max(file.size, 1),
        0,
      );
      let completedBytes = 0;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setUploadProgress({
          sourceId,
          fileName: file.name,
          index: i + 1,
          total: files.length,
          filePercent: 0,
          overallPercent: Math.round((completedBytes / totalBytes) * 100),
          okCount,
          failCount,
        });
        try {
          await api.admin.uploadWallpaper(sourceId, file, (loaded, total) => {
            const fileTotal = Math.max(total ?? file.size, 1);
            const fileLoaded = Math.min(loaded, fileTotal);
            setUploadProgress({
              sourceId,
              fileName: file.name,
              index: i + 1,
              total: files.length,
              filePercent: Math.round((fileLoaded / fileTotal) * 100),
              overallPercent: Math.round(
                ((completedBytes +
                  Math.min(fileLoaded, file.size || fileTotal)) /
                  totalBytes) *
                  100,
              ),
              okCount,
              failCount,
            });
          });
          okCount += 1;
        } catch (err) {
          failCount += 1;
          console.error("upload failed", file.name, err);
          toast.error(`「${file.name}」上传失败`);
        } finally {
          completedBytes += Math.max(file.size, 1);
          setUploadProgress({
            sourceId,
            fileName: file.name,
            index: i + 1,
            total: files.length,
            filePercent: 100,
            overallPercent: Math.round((completedBytes / totalBytes) * 100),
            okCount,
            failCount,
          });
        }
      }
      if (okCount > 0) {
        toast.success(`已上传 ${okCount} 张壁纸`);
        await Promise.all([
          loadSources(),
          loadWallpapers(selectedSourceId, wallpaperPage),
        ]);
      }
    } finally {
      setUploadProgress((prev) =>
        prev ? { ...prev, filePercent: 100, overallPercent: 100 } : prev,
      );
      window.setTimeout(() => setUploadProgress(null), 1200);
      setUploadingTo(null);
      uploadTargetSourceRef.current = null;
    }
  };

  const openWallpaperCtx = (e: React.MouseEvent, w: AdminRemoteWallpaper) => {
    e.preventDefault();
    e.stopPropagation();
    const items: CtxItem[] = [
      { icon: "eye", label: "查看详情", onClick: () => setDetailWallpaper(w) },
      {
        icon: "edit",
        label: "重命名",
        onClick: () => handleRenameWallpaper(w),
      },
    ];
    if (w.originalUrl && !w.originalUrl.startsWith("manual://")) {
      items.push({
        icon: "external",
        label: "打开原始链接",
        onClick: () => {
          // SEC(防御纵深): 抓取来源的媒体 URL 同样仅放行 http/https。
          const safe = safeHttpUrl(w.originalUrl);
          if (!safe) {
            toast.error("无效的链接地址");
            return;
          }
          window.open(safe, "_blank", "noopener,noreferrer");
        },
      });
    }
    const copyTarget = w.storageKey
      ? `/uploads/${w.storageKey}`
      : w.originalUrl;
    if (copyTarget) {
      items.push({
        icon: "link",
        label: "复制图片地址",
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(
              new URL(copyTarget, window.location.origin).href,
            );
            toast.success("已复制到剪贴板");
          } catch {
            toast.error("复制失败");
          }
        },
      });
    }
    items.push({ divider: true });
    items.push({
      icon: "trash",
      label: "删除壁纸",
      danger: true,
      onClick: () => handleDeleteWallpaper(w.id),
    });
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const sourceNameOf = (sid: string) =>
    sources.find((s) => s.id === sid)?.name ?? "未知来源";

  const openEditForm = (source: WallpaperSourceView) => {
    setEditingId(source.id);
    const config = SCRAPER_CONFIGS[source.scraperType];
    const apiKey = config?.keyParam
      ? extractKeyFromUrl(source.siteUrl, config.keyParam)
      : "";
    const siteUrl = config?.keyParam
      ? stripKeyFromUrl(source.siteUrl, config.keyParam)
      : source.siteUrl;
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
    if (!form.name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    const isManual = form.scraperType === "manual";
    if (!isManual && !form.siteUrl.trim()) {
      toast.error("地址不能为空");
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
        const updated = await api.admin.updateWallpaperSource(
          editingId,
          payload,
        );
        setSources((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
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

  const editingSource = editingId
    ? sources.find((s) => s.id === editingId)
    : null;

  if (showAddForm) {
    return (
      <SourceForm
        form={form}
        setForm={setForm}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        submitting={submitting}
        editingId={editingId}
        editingSource={editingSource}
        onSubmit={handleSubmitForm}
        onCancel={() => {
          setShowAddForm(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            壁纸库管理
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
            配置壁纸抓取来源，系统会自动拉取并缓存到 MinIO，支持定时刷新。
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingId(null);
            setForm(defaultForm());
          }}
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
      <SourcesTable
        sources={sources}
        loading={loadingSources}
        selectedSourceId={selectedSourceId}
        uploadingTo={uploadingTo}
        uploadProgress={uploadProgress}
        fetching={fetching}
        onSelect={(src) => {
          const next = selectedSourceId === src.id ? null : src.id;
          setSelectedSourceId(next);
          setWallpaperPage(0);
        }}
        onToggleEnabled={handleToggleEnabled}
        onUpload={triggerUpload}
        onTriggerFetch={handleTriggerFetch}
        onEdit={openEditForm}
        onDelete={handleDeleteSource}
      />

      {uploadProgress && <UploadProgressBar progress={uploadProgress} />}

      {/* Wallpapers grid */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>已缓存壁纸</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            htmlFor="admin-wp-source-filter"
            style={{ fontSize: 12, color: "var(--text-soft)" }}
          >
            来源筛选
          </label>
          <select
            id="admin-wp-source-filter"
            value={selectedSourceId ?? ""}
            onChange={(e) => {
              setSelectedSourceId(e.target.value || null);
              setWallpaperPage(0);
            }}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              borderRadius: 6,
              background: "var(--admin-bg)",
              border: "1px solid var(--admin-border-str)",
              color: "var(--text)",
              cursor: "pointer",
              minWidth: 140,
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
            <WallpaperCard
              key={w.id}
              wallpaper={w}
              onOpen={setDetailWallpaper}
              onContextMenu={openWallpaperCtx}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {wallpaperTotal > 0 &&
        (() => {
          const totalPages = Math.max(1, Math.ceil(wallpaperTotal / PAGE_SIZE));
          return (
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                alignItems: "center",
                marginTop: 20,
              }}
            >
              <button
                disabled={wallpaperPage === 0}
                onClick={() => setWallpaperPage((p) => Math.max(0, p - 1))}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: "var(--admin-border-soft)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  opacity: wallpaperPage === 0 ? 0.4 : 1,
                }}
              >
                上一页
              </button>
              <span
                style={{
                  lineHeight: "30px",
                  fontSize: 13,
                  color: "var(--text-soft)",
                }}
              >
                第 {wallpaperPage + 1} / {totalPages} 页 · 共 {wallpaperTotal}{" "}
                张
              </span>
              <button
                disabled={wallpaperPage + 1 >= totalPages}
                onClick={() => setWallpaperPage((p) => p + 1)}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: "var(--admin-border-soft)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  opacity: wallpaperPage + 1 >= totalPages ? 0.4 : 1,
                }}
              >
                下一页
              </button>
            </div>
          );
        })()}

      {/* Detail modal */}
      {detailWallpaper && (
        <WallpaperDetailModal
          wallpaper={detailWallpaper}
          sourceName={sourceNameOf(detailWallpaper.sourceId)}
          onClose={() => setDetailWallpaper(null)}
          onRename={handleRenameWallpaper}
          onDelete={handleDeleteWallpaper}
        />
      )}

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        title="上传壁纸"
        aria-label="上传壁纸"
        style={{ display: "none" }}
        onChange={handleUploadFile}
      />

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
