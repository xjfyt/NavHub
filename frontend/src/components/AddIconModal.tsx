import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import {
  GroupView,
  IconFontSize,
  IconImageRadius,
  IconImageStyle,
  IconSize,
  IconTextAlign,
  IconView,
  LibraryIconView,
} from "../types";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { api } from "../api";
import { toast } from "sonner";
import {
  buildBuiltinIconUrl,
  inferNameFromUrl,
  normalizeSiteUrl,
  parseBuiltinIconUrl,
} from "../utils/iconSources";
import { stripExt, toBuiltinIconName } from "./add-icon-modal/helpers";
import { PreviewPanel } from "./add-icon-modal/PreviewPanel";
import { SourceSelector } from "./add-icon-modal/SourceSelector";
import { UrlSourcePanel } from "./add-icon-modal/UrlSourcePanel";
import { UploadSourcePanel } from "./add-icon-modal/UploadSourcePanel";
import { BuiltinSourcePanel } from "./add-icon-modal/BuiltinSourcePanel";
import { LibrarySourcePanel } from "./add-icon-modal/LibrarySourcePanel";
import { AppearancePicker } from "./add-icon-modal/AppearancePicker";
import type {
  AddIconPayload,
  BuiltinIconName,
  IconSourceMode,
} from "./add-icon-modal/types";

export type { AddIconPayload } from "./add-icon-modal/types";

export function AddIconModal({
  groups,
  defaultGroupId,
  onClose,
  onSave,
  initialIcon,
}: {
  groups: GroupView[];
  defaultGroupId: string;
  onClose: () => void;
  onSave: (body: AddIconPayload) => void | Promise<void>;
  initialIcon?: IconView;
}) {
  const editableGroups = useMemo(
    () => groups.filter((g) => !g.readOnly),
    [groups],
  );
  const initialGroup =
    initialIcon?.groupId ||
    editableGroups.find((g) => g.id === defaultGroupId)?.id ||
    editableGroups[0]?.id ||
    defaultGroupId;

  const initSourceMode = (): IconSourceMode => {
    if (!initialIcon) return "url";
    if (initialIcon.letter) return "letter";
    if (parseBuiltinIconUrl(initialIcon.imageUrl)) return "builtin";
    if (initialIcon.imageUrl) return "upload";
    return "url";
  };

  const [name, setName] = useState(initialIcon?.name || "");
  const [nameTouched, setNameTouched] = useState(!!initialIcon?.name);
  const [url, setUrl] = useState(initialIcon?.url || "");
  const [sub, setSub] = useState(initialIcon?.sub || "");
  const [groupId, setGroupId] = useState(initialGroup);
  const [size, setSize] = useState<IconSize>(initialIcon?.size || "sq");
  const [letter, setLetter] = useState(initialIcon?.letter || "");
  const [color, setColor] = useState(initialIcon?.color ?? 0);
  const [iframePreview, setIframePreview] = useState(
    initialIcon?.iframePreview ?? false,
  );
  const [sourceMode, setSourceMode] =
    useState<IconSourceMode>(initSourceMode());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(
    sourceMode === "upload" ? initialIcon?.imageUrl || null : null,
  );
  const [builtinIcon, setBuiltinIcon] = useState<BuiltinIconName>(
    toBuiltinIconName(parseBuiltinIconUrl(initialIcon?.imageUrl)),
  );
  const [librarySelectedUrl, setLibrarySelectedUrl] = useState<string | null>(
    sourceMode === "library" ? initialIcon?.imageUrl || null : null,
  );
  const [libraries, setLibraries] = useState<any[]>([]);
  const [libraryIcons, setLibraryIcons] = useState<LibraryIconView[]>([]);
  const [activeLibraryId, setActiveLibraryId] =
    useState<string>("user_uploads");
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [fetchingLibs, setFetchingLibs] = useState(false);

  const [imageStyle, setImageStyle] = useState<IconImageStyle>(
    initialIcon?.imageStyle || "plain",
  );
  const [imageRadius, setImageRadius] = useState<IconImageRadius>(
    initialIcon?.imageRadius || "rounded",
  );
  const [fontSize, setFontSize] = useState<IconFontSize>(
    initialIcon?.fontSize || "md",
  );
  const [textAlign, setTextAlign] = useState<IconTextAlign>(
    initialIcon?.textAlign || "center",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [autoImageUrls, setAutoImageUrls] = useState<
    { url: string; source: string }[]
  >([]);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAutoImageUrl, setSelectedAutoImageUrl] = useState<
    string | null
  >(null);
  const [isSearchingUrl, setIsSearchingUrl] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadLibraryIcons = useCallback((id: string, search: string) => {
    if (id === "user_uploads") {
      api.admin
        .getUserUploads(search)
        .then(setLibraryIcons)
        .catch(console.error);
    } else {
      api.admin
        .remoteIconAssets({
          sourceId: id,
          limit: 1000,
          search: search || undefined,
        })
        .then((res) => {
          setLibraryIcons(
            res.items.map((r) => ({
              id: r.id,
              libraryId: r.sourceId,
              name: r.title || "icon",
              url: r.storageKey ? `/uploads/${r.storageKey}` : r.originalUrl,
              sha256: "",
              uploaderId: null,
              uploaderName: null,
              size: 0,
              contentType: "image/svg+xml",
              createdAt: r.fetchedAt,
              updatedAt: r.fetchedAt,
            })),
          );
        })
        .catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (sourceMode === "library" && !librariesLoaded && !fetchingLibs) {
      setFetchingLibs(true);
      api.admin
        .iconAssetSources()
        .then((res) => {
          setLibraries(res);
          setLibrariesLoaded(true);
          setFetchingLibs(false);
          loadLibraryIcons(activeLibraryId, debouncedSearchQuery);
        })
        .catch(() => setFetchingLibs(false));
    }
  }, [
    sourceMode,
    librariesLoaded,
    fetchingLibs,
    activeLibraryId,
    loadLibraryIcons,
    debouncedSearchQuery,
  ]);

  useEffect(() => {
    if (sourceMode === "library" && librariesLoaded) {
      loadLibraryIcons(activeLibraryId, debouncedSearchQuery);
    }
  }, [
    debouncedSearchQuery,
    activeLibraryId,
    sourceMode,
    librariesLoaded,
    loadLibraryIcons,
  ]);

  const handleLibClick = (id: string) => {
    if (id === activeLibraryId) return;
    setActiveLibraryId(id);
    loadLibraryIcons(id, debouncedSearchQuery);
  };

  const normalizedUrl = normalizeSiteUrl(url);
  const inferredName = inferNameFromUrl(url);

  useEffect(() => {
    if (!normalizedUrl || sourceMode !== "url") return;
    setIsSearchingUrl(true);
    let isCancelled = false;
    api
      .faviconSearch(normalizedUrl)
      .then((res) => {
        if (isCancelled) return;
        setAutoImageUrls(res);
        setFailedImageUrls(new Set());
        if (res.length > 0) setSelectedAutoImageUrl(res[0].url);
        else setSelectedAutoImageUrl(null);
      })
      .catch(console.error)
      .finally(() => {
        if (!isCancelled) setIsSearchingUrl(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [normalizedUrl, sourceMode]);
  const effectiveName = name.trim() || inferredName;
  const effectiveImageUrl =
    sourceMode === "upload"
      ? uploadedImageUrl
      : sourceMode === "builtin"
        ? buildBuiltinIconUrl(builtinIcon)
        : sourceMode === "library"
          ? librarySelectedUrl
          : sourceMode === "url"
            ? selectedAutoImageUrl
            : null;

  useEffect(() => {
    if (nameTouched) return;
    setName(inferredName);
  }, [inferredName, nameTouched]);

  const preview: IconView = {
    id: "__preview__",
    groupId,
    name: effectiveName || "名称",
    url: normalizedUrl || url || null,
    sub: sub || null,
    title: null,
    cta: null,
    size,
    letter: effectiveImageUrl ? null : letter || null,
    color,
    imageUrl: effectiveImageUrl,
    imageStyle,
    imageRadius,
    isFolder: false,
    iframePreview,
    sortOrder: 0,
    gridX: null,
    gridY: null,
    fontSize,
    textAlign,
    folderItems: [],
    readOnly: false,
  };

  const canSave =
    effectiveName.trim().length > 0 &&
    !!groupId &&
    !uploading &&
    (sourceMode !== "upload" || !!uploadedImageUrl) &&
    (sourceMode !== "url" || !!selectedAutoImageUrl) &&
    (sourceMode !== "library" || !!librarySelectedUrl);

  const submit = (e?: FormEvent) => {
    // UX-29: 既作为表单 onSubmit(Enter),也作为主按钮 onClick。
    e?.preventDefault();
    if (!canSave) return;
    onSave({
      groupId,
      name: effectiveName.trim(),
      url: normalizedUrl || url.trim() || null,
      sub: sub.trim() || null,
      size,
      letter: effectiveImageUrl ? null : letter.trim() || null,
      color,
      iframePreview,
      imageUrl: effectiveImageUrl,
      imageStyle,
      imageRadius,
      fontSize,
      textAlign,
    });
  };

  const uploadFile = async (file?: File | null) => {
    if (!file) return;
    setSourceMode("upload");
    setUploading(true);
    try {
      const uploaded = await api.upload(file);
      setUploadedImageUrl(uploaded.url);
      if (!nameTouched && !name.trim()) {
        setName(stripExt(file.name));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败";
      toast.error(message);
    } finally {
      setUploading(false);
      setDragOver(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={initialIcon ? "编辑图标" : "添加图标"}
      overlayClassName="wcc-backdrop"
      className="wcc-modal glass-strong"
      contentStyle={{ width: 840, height: "auto", maxHeight: "90vh" }}
    >
      <div className="wcc-head">
        <div className="wcc-tabs">
          <span className="active">
            {initialIcon ? "编辑图标" : "添加图标"}
          </span>
        </div>
        <button
          className="modal-close"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-soft)",
          }}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <form onSubmit={submit} style={{ display: "contents" }}>
        <div
          className="wcc-body"
          style={{
            padding: "32px",
            display: "grid",
            gridTemplateColumns: "minmax(240px, 1.1fr) 2fr",
            gap: "32px",
            alignItems: "start",
            overflowY: "auto",
          }}
        >
          {/* LEFT: Preview & Visuals */}
          <PreviewPanel
            preview={preview}
            size={size}
            onSizeChange={setSize}
            color={color}
            onColorChange={setColor}
            letter={letter}
            onLetterChange={setLetter}
          />

          {/* RIGHT: Form Data */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div className="field-row" style={{ marginBottom: 0 }}>
              <div className="field" style={{ width: "100%" }}>
                <label htmlFor="ai-name">名称 Name</label>
                <input
                  id="ai-name"
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setNameTouched(true);
                    setName(e.target.value);
                  }}
                  placeholder="如 GitHub"
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ai-url">链接 URL</label>
              <input
                id="ai-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ai-sub">副标题 Sub</label>
              <input
                id="ai-sub"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                placeholder="显示在大图模式下方 (选填)"
              />
            </div>

            <div
              className="field"
              style={{
                marginTop: "6px",
                marginBottom: 0,
              }}
            >
              <SourceSelector
                sourceMode={sourceMode}
                onSourceModeChange={setSourceMode}
              />

              {sourceMode === "url" && (
                <UrlSourcePanel
                  normalizedUrl={normalizedUrl}
                  isSearchingUrl={isSearchingUrl}
                  autoImageUrls={autoImageUrls}
                  failedImageUrls={failedImageUrls}
                  selectedAutoImageUrl={selectedAutoImageUrl}
                  onSelectAutoImageUrl={setSelectedAutoImageUrl}
                  onImageError={(failedUrl) =>
                    setFailedImageUrls((prev) => new Set(prev).add(failedUrl))
                  }
                />
              )}

              {sourceMode === "upload" && (
                <UploadSourcePanel
                  fileRef={fileRef}
                  uploading={uploading}
                  dragOver={dragOver}
                  uploadedImageUrl={uploadedImageUrl}
                  onSetDragOver={setDragOver}
                  onUploadFile={uploadFile}
                  onClearUploadedImage={() => setUploadedImageUrl(null)}
                />
              )}

              {sourceMode === "builtin" && (
                <BuiltinSourcePanel
                  builtinIcon={builtinIcon}
                  onSelectBuiltinIcon={setBuiltinIcon}
                />
              )}

              {sourceMode === "library" && (
                <LibrarySourcePanel
                  libraries={libraries}
                  activeLibraryId={activeLibraryId}
                  onLibClick={handleLibClick}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  libraryIcons={libraryIcons}
                  librarySelectedUrl={librarySelectedUrl}
                  onSelectLibraryIcon={setLibrarySelectedUrl}
                />
              )}

              <AppearancePicker
                showImageOptions={sourceMode !== "letter"}
                imageStyle={imageStyle}
                onImageStyleChange={setImageStyle}
                imageRadius={imageRadius}
                onImageRadiusChange={setImageRadius}
                fontSize={fontSize}
                onFontSizeChange={setFontSize}
                textAlign={textAlign}
                onTextAlignChange={setTextAlign}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                marginTop: "auto",
                fontSize: 13,
                color: "var(--text-soft)",
                paddingBottom: 4,
              }}
              onClick={() => setIframePreview((v) => !v)}
            >
              <div className={"switch " + (iframePreview ? "on" : "")} />
              内嵌弹窗打开
            </label>
          </div>
        </div>

        <div className="wcc-foot" style={{ marginTop: "auto" }}>
          <div className="wcc-dest">
            <span>添加至</span>
            <div
              className="wcc-dest-select glass"
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                border: "1px solid var(--glass-border-soft)",
              }}
            >
              <Icon name="folder" size={14} color="var(--text-soft)" />
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text)",
                  outline: "none",
                  appearance: "none",
                  paddingRight: "8px",
                  fontWeight: 500,
                  fontSize: "13px",
                }}
              >
                {editableGroups.map((g) => (
                  <option key={g.id} value={g.id} style={{ color: "black" }}>
                    {g.name}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={12} color="var(--text-soft)" />
            </div>
          </div>
          <button type="button" className="wcc-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className={"wcc-btn-add" + (canSave ? "" : " disabled")}
          >
            保存图标
          </button>
        </div>
      </form>
    </Modal>
  );
}
