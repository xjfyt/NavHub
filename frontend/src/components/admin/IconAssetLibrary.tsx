import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { toast } from "sonner";
import { confirmDialog } from "../Dialogs";
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
import { RenameIconModal } from "./RenameIconModal";
import type { SourceFormState } from "./icon-asset-library/types";
import { PAGE_SIZE, defaultForm } from "./icon-asset-library/constants";
import {
  storageKeyFromUpload,
  titleFromFileName,
} from "./icon-asset-library/helpers";
import { SourceForm } from "./icon-asset-library/SourceForm";
import { SourcesTable } from "./icon-asset-library/SourcesTable";
import { IconGrid } from "./icon-asset-library/IconGrid";

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
            title: titleFromFileName(files[i].name),
            originalUrl: res.url,
            storageKey: storageKeyFromUpload(res),
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

  const editingSource = editingId
    ? sources.find((s) => s.id === editingId)
    : null;

  if (showAddForm) {
    return (
      <SourceForm
        form={form}
        setForm={setForm}
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

      <SourcesTable
        sources={sources}
        loading={loadingSources}
        selectedSourceId={selectedSourceId}
        fetching={fetching}
        onToggleEnabled={handleToggleEnabled}
        onTriggerFetch={handleTriggerFetch}
        onEdit={openEditForm}
        onDelete={handleDeleteSource}
      />

      <IconGrid
        sources={sources}
        icons={icons}
        libIcons={libIcons}
        iconTotal={iconTotal}
        selectedSourceId={selectedSourceId}
        loading={loadingIcons}
        iconPage={iconPage}
        searchQuery={searchQuery}
        onSelectSource={(sourceId) => {
          setSelectedSourceId(sourceId);
          setIconPage(0);
        }}
        onSearchChange={setSearchQuery}
        onBatchUpload={batchUpload}
        onRename={setRenamingIcon}
        onDelete={handleDeleteIcon}
        onPrevPage={() => setIconPage((p) => Math.max(0, p - 1))}
        onNextPage={() => setIconPage((p) => p + 1)}
      />

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
