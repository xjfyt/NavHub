import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { toast } from "sonner";
import { confirmDialog } from "../Dialogs";
import { Icon } from "../Icon";
import {
  summarizeBatch,
  formatBatchSummary,
  type BatchItemResult,
} from "../../utils/batchResult";
import type {
  IconAssetSourceView,
  AdminRemoteIconAsset,
  LibraryIconView,
} from "../../types";

const SCRAPER_CONFIGS: Record<
  string,
  { label: string; defaultUrl: string; defaultBatch: number }
> = {
  iconify: {
    label: "Iconify",
    defaultUrl: "https://icon-sets.iconify.design/logos/",
    defaultBatch: 5000,
  },
};

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
  <div
    style={{
      color: "var(--text-soft)",
      fontSize: 13,
      padding: "24px 0",
      textAlign: "center",
    }}
  >
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
  siteUrl: SCRAPER_CONFIGS.iconify.defaultUrl,
  enabled: true,
  fetchBatchSize: 50,
  cacheTtlHours: 168,
  fetchIntervalHours: 24,
  sourceType: "svg",
  scraperType: "iconify",
});

import { RenameIconModal } from "./RenameIconModal";

export const AdminIconAssetLibrary = () => {
  const [sources, setSources] = useState<IconAssetSourceView[]>([]);
  const [icons, setIcons] = useState<AdminRemoteIconAsset[]>([]);
  const [libIcons, setLibIcons] = useState<LibraryIconView[]>([]);
  const [iconTotal, setIconTotal] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingIcons, setLoadingIcons] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SourceFormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [iconPage, setIconPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [renamingIcon, setRenamingIcon] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const PAGE_SIZE = 48;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const data = await api.admin.iconAssetSources();
      setSources(data);
    } catch {
      toast.error("加载图标来源失败");
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadIcons = useCallback(
    async (sourceId: string | null, page = 0, search = "") => {
      setLoadingIcons(true);
      try {
        if (sourceId === "user_uploads") {
          const data = await api.admin.getUserUploads(search);
          setLibIcons(data);
          setIconTotal(data.length);
          setIcons([]);
        } else {
          const data = await api.admin.remoteIconAssets({
            sourceId: sourceId ?? undefined,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            search: search || undefined,
          });
          setIcons(data.items);
          setIconTotal(data.total);
          setLibIcons([]);
        }
      } catch {
        toast.error("加载图标列表失败");
      } finally {
        setLoadingIcons(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    loadIcons(selectedSourceId, iconPage, debouncedSearchQuery);
  }, [selectedSourceId, iconPage, debouncedSearchQuery, loadIcons]);

  const handleTriggerFetch = async (source: IconAssetSourceView) => {
    setFetching(source.id);
    // UX-14: 后端 /fetch 为 fire-and-forget(返回 {status:"started"} 后台异步),
    // 无任务状态/进度接口可轮询。诚实呈现「抓取中」并轮询 totalFetched 观察增量。
    const before = source.totalFetched ?? 0;
    let toastId: string | number | undefined;
    try {
      await api.admin.triggerIconAssetFetch(source.id);
      toastId = toast.loading(`正在抓取：${source.name}…`);
    } catch {
      toast.error("启动抓取失败");
      setFetching(null);
      return;
    }

    const POLL_INTERVAL = 3000;
    const MAX_POLLS = 6;
    let polls = 0;
    let lastTotal = before;
    let stableRounds = 0;
    const poll = async () => {
      polls += 1;
      try {
        const list = await api.admin.iconAssetSources();
        setSources(list);
        const cur = list.find((s) => s.id === source.id);
        const curTotal = cur?.totalFetched ?? lastTotal;
        if (curTotal === lastTotal) stableRounds += 1;
        else stableRounds = 0;
        lastTotal = curTotal;
        loadIcons(selectedSourceId, iconPage, debouncedSearchQuery);
      } catch {
        /* 忽略单次轮询失败 */
      }
      if (stableRounds >= 2 || polls >= MAX_POLLS) {
        const delta = Math.max(0, lastTotal - before);
        if (toastId !== undefined) toast.dismiss(toastId);
        if (delta > 0) {
          toast.success(`抓取完成：新增 ${delta} 个图标`);
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

  const handleToggleEnabled = async (source: IconAssetSourceView) => {
    try {
      const updated = await api.admin.updateIconAssetSource(source.id, {
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
        "确定删除该图标来源？关联的图标也会一并删除。",
        undefined,
        { danger: true },
      ))
    )
      return;
    try {
      await api.admin.deleteIconAssetSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
      if (selectedSourceId === id) setSelectedSourceId(null);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleDeleteIcon = async (id: string) => {
    if (
      !(await confirmDialog("确定删除该图标吗？操作不可撤销。", undefined, {
        danger: true,
      }))
    )
      return;
    try {
      if (selectedSourceId === "user_uploads") {
        await api.admin.deleteIcon(id);
        setLibIcons((prev) => prev.filter((w) => w.id !== id));
      } else {
        await api.admin.deleteRemoteIconAsset(id);
        setIcons((prev) => prev.filter((w) => w.id !== id));
      }
      setIconTotal((t) => Math.max(0, t - 1));
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const batchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedSourceId) return;

    setLoadingIcons(true);
    // UX-18: 逐文件统计成功/失败,不再吞错也不再无脑「上传成功」。
    const perFile: BatchItemResult[] = [];
    const userUploadItems: Awaited<ReturnType<typeof api.upload>>[] = [];
    const remoteUploadItems: {
      title: string;
      originalUrl: string;
      storageKey: string;
      fileSizeBytes: number;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const purpose = selectedSourceId === "user_uploads" ? "icon" : "upload";
        const res = await api.upload(files[i], purpose);
        if (selectedSourceId === "user_uploads") {
          userUploadItems.push(res);
        } else {
          remoteUploadItems.push({
            title: files[i].name.replace(/\.[^/.]+$/, ""),
            originalUrl: res.url,
            storageKey:
              res.filename ??
              res.url.split("?")[0].split("/uploads/").pop() ??
              "",
            fileSizeBytes: res.size,
          });
        }
        perFile.push({ ok: true });
      } catch (err: any) {
        console.error("Upload failed for " + files[i].name, err);
        perFile.push({ ok: false, error: err?.message || "上传失败" });
      }
    }

    try {
      if (selectedSourceId === "user_uploads") {
        if (userUploadItems.length > 0) loadIcons("user_uploads", 0);
        const summary = summarizeBatch(perFile);
        if (summary.fail === 0) {
          toast.success(formatBatchSummary(summary, "个"));
        } else {
          toast.error(formatBatchSummary(summary, "个"));
        }
      } else if (remoteUploadItems.length > 0) {
        // 后端按内容去重后返回真实新增数 added;失败的文件来自上传阶段。
        const { added } = await api.admin.addManualIconsToSource(
          selectedSourceId,
          remoteUploadItems,
        );
        loadIcons(selectedSourceId, 0);
        const failCount = perFile.filter((r) => !r.ok).length;
        const duplicates = remoteUploadItems.length - added;
        const dupHint = duplicates > 0 ? `(去重跳过 ${duplicates} 个)` : "";
        const summary = formatBatchSummary(
          { ok: added, fail: failCount, total: files.length, errors: [] },
          "个",
        );
        if (failCount === 0) {
          toast.success(`${summary}${dupHint}`);
        } else {
          toast.error(`${summary}${dupHint}`);
        }
      } else {
        // 全部在上传阶段失败,没有任何条目可入库。
        const summary = summarizeBatch(perFile);
        toast.error(formatBatchSummary(summary, "个"));
      }
    } catch (err: any) {
      toast.error("入库失败：" + (err?.message || "未知错误"));
    }

    setLoadingIcons(false);
    e.target.value = "";
  };

  const openEditForm = (source: IconAssetSourceView) => {
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
    const payload = { ...form };
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await api.admin.updateIconAssetSource(
          editingId,
          payload,
        );
        setSources((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
        toast.success("已更新");
      } else {
        const created = await api.admin.createIconAssetSource(payload);
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
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => {
    const val = form[field];
    return (
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-soft)",
            marginBottom: 4,
          }}
        >
          {label}
        </label>
        {type === "checkbox" ? (
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) =>
              setForm((f) => ({ ...f, [field]: e.target.checked }))
            }
          />
        ) : (
          <input
            type={type}
            value={String(val)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [field]:
                  type === "number" ? Number(e.target.value) : e.target.value,
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
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const editingSource = editingId
    ? sources.find((s) => s.id === editingId)
    : null;

  if (showAddForm) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => {
              setShowAddForm(false);
              setEditingId(null);
            }}
            style={{
              background: "var(--admin-border-str)",
              border: "none",
              width: 28,
              height: 28,
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text)",
            }}
            title="返回列表"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {editingId ? "编辑图标来源" : "添加图标来源"}
            </h2>
            {editingSource ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-soft)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                正在编辑：
                <span style={{ color: "var(--text)", fontWeight: 500 }}>
                  {editingSource.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    background: "var(--admin-border-str)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {editingSource.scraperType}
                </span>
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
                选择爬虫类型并填写参数，保存后立即生效。
              </p>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: "0 20px",
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginBottom: 4,
                  }}
                >
                  图标来源
                </label>
                <select
                  value={form.scraperType}
                  onChange={(e) => {
                    const t = e.target.value;
                    const cfg = SCRAPER_CONFIGS[t];
                    setForm((f) => ({
                      ...f,
                      scraperType: t,
                      siteUrl: cfg?.defaultUrl ?? f.siteUrl,
                      fetchBatchSize: cfg?.defaultBatch ?? f.fetchBatchSize,
                      name: f.name || cfg?.label || f.name,
                    }));
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: "var(--admin-bg)",
                    border: "1px solid var(--admin-border-str)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 13,
                  }}
                >
                  {Object.entries(SCRAPER_CONFIGS).map(([id, cfg]) => (
                    <option key={id} value={id}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
              {formField("名称", "name", "text", {
                placeholder: "自定义来源名称",
              })}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-soft)",
                  marginBottom: 4,
                }}
              >
                API / 子集地址 (支持多行、逗号分隔)
              </label>
              <textarea
                value={form.siteUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, siteUrl: e.target.value }))
                }
                placeholder="https://...可以粘贴多个地址"
                style={{
                  width: "100%",
                  height: 80,
                  padding: "8px 10px",
                  background: "var(--admin-bg)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 13,
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 20px",
              }}
            >
              {formField("缓存时长 (小时)", "cacheTtlHours", "number", {
                min: 1,
              })}
              {formField("抓取间隔 (小时)", "fetchIntervalHours", "number", {
                min: 1,
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0 20px",
              }}
            >
              {formField("媒体类型", "sourceType", "text", { readOnly: true })}
              <div
                style={{
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingTop: 22,
                }}
              >
                <input
                  type="checkbox"
                  id="enabled-chk"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, enabled: e.target.checked }))
                  }
                />
                <label
                  htmlFor="enabled-chk"
                  style={{ fontSize: 13, cursor: "pointer" }}
                >
                  启用自动抓取
                </label>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingId(null);
                }}
                style={{
                  padding: "7px 16px",
                  background: "transparent",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 8,
                  color: "var(--text)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "7px 16px",
                  background: "var(--accent)",
                  color: "var(--text-inv)",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
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
            内置图标库管理
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
            配置第三方图标抓取来源，系统会自动拉取并在全站通用。
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

      <div
        style={{
          background: "var(--admin-border-soft)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "名称",
                "缓存(h)",
                "间隔(h)",
                "已抓取",
                "最后抓取",
                "状态",
                "操作",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingSources ? (
              <tr>
                <td colSpan={7} style={cell}>
                  <EmptyCell text="加载中..." />
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={7} style={cell}>
                  <EmptyCell text="暂无内置图标源，请点击右上角添加" />
                </td>
              </tr>
            ) : (
              sources.map((src) => (
                <tr
                  key={src.id}
                  style={{
                    background:
                      selectedSourceId === src.id
                        ? "var(--admin-border-str)"
                        : "transparent",
                  }}
                >
                  <td style={cell}>
                    <a
                      href={(() => {
                        try {
                          const u = new URL(src.siteUrl);
                          return `${u.protocol}//${u.hostname}`;
                        } catch {
                          return src.siteUrl;
                        }
                      })()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontWeight: 500,
                        color: "var(--text)",
                        textDecoration: "none",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.textDecoration = "underline")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.textDecoration = "none")
                      }
                    >
                      {src.name}
                    </a>
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {src.cacheTtlHours}
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {src.fetchIntervalHours}
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {src.totalFetched}
                  </td>
                  <td style={cell}>{formatDate(src.lastFetchedAt)}</td>
                  <td style={cell}>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleEnabled(src);
                      }}
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: src.enabled
                          ? "rgba(62,190,120,0.15)"
                          : "rgba(150,150,150,0.1)",
                        color: src.enabled ? "#3ebe78" : "var(--text-soft)",
                      }}
                    >
                      {src.enabled ? "启用" : "停用"}
                    </span>
                  </td>
                  <td
                    style={{ ...cell, whiteSpace: "nowrap" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleTriggerFetch(src)}
                      disabled={fetching === src.id}
                      style={{
                        marginRight: 6,
                        padding: "4px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: "var(--accent)",
                        color: "var(--text-inv)",
                        border: "none",
                        borderRadius: 6,
                        opacity: fetching === src.id ? 0.6 : 1,
                      }}
                    >
                      {fetching === src.id ? "抓取中..." : "立即抓取"}
                    </button>
                    <button
                      onClick={() => openEditForm(src)}
                      style={{
                        marginRight: 6,
                        padding: "4px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: "transparent",
                        border: "1px solid var(--admin-border-str)",
                        borderRadius: 6,
                        color: "var(--text)",
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteSource(src.id)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: "rgba(255,90,90,0.1)",
                        border: "none",
                        borderRadius: 6,
                        color: "#ff6b6b",
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>已缓存图标</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            htmlFor="admin-icon-source-filter"
            style={{ fontSize: 12, color: "var(--text-soft)" }}
          >
            来源筛选
          </label>
          <select
            id="admin-icon-source-filter"
            value={selectedSourceId ?? ""}
            onChange={(e) => {
              setSelectedSourceId(e.target.value || null);
              setIconPage(0);
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
            <option value="">全部来源</option>
            <option value="user_uploads">
              用户上传图库 (通过前台或API上传)
            </option>
            {sources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name} · {src.totalFetched} 个
              </option>
            ))}
          </select>
          <div
            className="search-box"
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--admin-bg)",
              border: "1px solid var(--admin-border-str)",
              borderRadius: 6,
              padding: "2px 8px",
              width: 160,
            }}
          >
            <Icon name="search" size={12} color="var(--text-soft)" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索图标..."
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 12,
                padding: "4px 8px",
                width: "100%",
                color: "var(--text)",
              }}
            />
          </div>
          {selectedSourceId && (
            <label
              className="pill-btn primary"
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "5px 10px",
              }}
            >
              <Icon name="plus" size={12} /> 批量上传
              <input
                type="file"
                multiple
                accept="image/*,.svg"
                style={{ display: "none" }}
                onChange={batchUpload}
                disabled={loadingIcons}
              />
            </label>
          )}
        </div>
      </div>

      <style>{`
        .icon-admin-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(6, 1fr);
        }
        @media (min-width: 1000px) {
          .icon-admin-grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
        @media (min-width: 1400px) {
          .icon-admin-grid {
            grid-template-columns: repeat(12, 1fr);
          }
        }
        @media (min-width: 1800px) {
          .icon-admin-grid {
            grid-template-columns: repeat(16, 1fr);
          }
        }
      `}</style>

      {loadingIcons ? (
        <EmptyCell text="加载中..." />
      ) : icons.length === 0 && libIcons.length === 0 ? (
        <EmptyCell text="暂无图标。选择来源并点击「立即抓取」或「上传」开始下载。" />
      ) : (
        <div className="icon-admin-grid">
          {selectedSourceId === "user_uploads"
            ? libIcons.map((w) => (
                <div
                  key={w.id}
                  style={{
                    background: "var(--admin-border-soft)",
                    borderRadius: 10,
                    overflow: "hidden",
                    position: "relative",
                    border: "1px solid var(--admin-border-str)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "16px 8px 8px",
                  }}
                >
                  <img
                    src={w.url}
                    alt={w.name ?? "图标"}
                    // PERF-4: 图标网格按需懒加载、异步解码,屏外图标不阻塞首屏。
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      marginTop: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                      textAlign: "center",
                    }}
                    title={w.name ?? undefined}
                  >
                    {w.name ?? "未命名"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      width: "100%",
                      marginTop: 8,
                    }}
                  >
                    <button
                      onClick={() =>
                        setRenamingIcon({ id: w.id, name: w.name || "" })
                      }
                      style={{
                        flex: 1,
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        background: "rgba(100,100,255,0.1)",
                        border: "none",
                        borderRadius: 4,
                        color: "#6464ff",
                      }}
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => handleDeleteIcon(w.id)}
                      style={{
                        flex: 1,
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        background: "rgba(255,90,90,0.1)",
                        border: "none",
                        borderRadius: 4,
                        color: "#ff6b6b",
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            : icons.map((w) => (
                <div
                  key={w.id}
                  style={{
                    background: "var(--admin-border-soft)",
                    borderRadius: 10,
                    overflow: "hidden",
                    position: "relative",
                    border: "1px solid var(--admin-border-str)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "16px 8px 8px",
                  }}
                >
                  <img
                    src={
                      w.storageKey ? `/uploads/${w.storageKey}` : w.originalUrl
                    }
                    alt={w.title ?? "图标"}
                    // PERF-4: 图标网格按需懒加载、异步解码,屏外图标不阻塞首屏。
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      marginTop: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                      textAlign: "center",
                    }}
                    title={w.title ?? undefined}
                  >
                    {w.title ?? "未命名"}
                  </div>
                  <button
                    onClick={() => handleDeleteIcon(w.id)}
                    style={{
                      marginTop: 8,
                      padding: "2px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      background: "rgba(255,90,90,0.1)",
                      border: "none",
                      borderRadius: 4,
                      color: "#ff6b6b",
                      alignSelf: "stretch",
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
        </div>
      )}

      {iconTotal > 0 &&
        (() => {
          const totalPages = Math.max(1, Math.ceil(iconTotal / PAGE_SIZE));
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
                disabled={iconPage === 0}
                onClick={() => setIconPage((p) => Math.max(0, p - 1))}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: "var(--admin-border-soft)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  opacity: iconPage === 0 ? 0.4 : 1,
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
                第 {iconPage + 1} / {totalPages} 页 · 共 {iconTotal} 个
              </span>
              <button
                disabled={iconPage + 1 >= totalPages}
                onClick={() => setIconPage((p) => p + 1)}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: "var(--admin-border-soft)",
                  border: "1px solid var(--admin-border-str)",
                  borderRadius: 6,
                  color: "var(--text)",
                  opacity: iconPage + 1 >= totalPages ? 0.4 : 1,
                }}
              >
                下一页
              </button>
            </div>
          );
        })()}

      {renamingIcon && (
        <RenameIconModal
          id={renamingIcon.id}
          initialName={renamingIcon.name}
          onClose={() => setRenamingIcon(null)}
          onSuccess={(newName) => {
            setLibIcons((prev) =>
              prev.map((i) =>
                i.id === renamingIcon.id ? { ...i, name: newName } : i,
              ),
            );
            setRenamingIcon(null);
          }}
        />
      )}
    </div>
  );
};
