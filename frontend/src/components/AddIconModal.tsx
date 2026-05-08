import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { DEFAULT_ICON_COLORS } from "../constants/design";
import { Icon } from "./Icon";
import { IconTile } from "./IconTile";
import { api } from "../api";
import { toast } from "sonner";
import {
  buildBuiltinIconUrl,
  inferNameFromUrl,
  normalizeSiteUrl,
  parseBuiltinIconUrl,
} from "../utils/iconSources";

const SIZE_OPTIONS: { id: IconSize; name: string; cls: string }[] = [
  { id: "sq", name: "方形", cls: "sq" },
  { id: "pill-size", name: "长条", cls: "pill" },
  { id: "circle-size", name: "圆形", cls: "circle" },
  { id: "lg", name: "大图", cls: "lg" },
];

const SOURCE_OPTIONS = [
  { id: "url", name: "自动获取", icon: "globe" },
  { id: "upload", name: "上传图片", icon: "image" },
  { id: "builtin", name: "内置库", icon: "grid" },
  { id: "library", name: "图标库", icon: "folder" },
  { id: "letter", name: "字符", icon: "type" },
] as const;

const BUILTIN_ICON_OPTIONS = [
  "globe", "grid", "home", "briefcase", "tool", "code", "search", "settings",
  "star", "heart", "cloud", "clock", "calendar", "bell", "shield", "lock",
  "key", "activity", "link", "external", "sun", "moon", "sparkle", "play",
] as const;

type IconSourceMode = (typeof SOURCE_OPTIONS)[number]["id"];

const IMAGE_STYLE_OPTIONS: { id: IconImageStyle; name: string }[] = [
  { id: "plain", name: "纯图" },
  { id: "framed", name: "底板" },
];

const IMAGE_RADIUS_OPTIONS: { id: IconImageRadius; name: string }[] = [
  { id: "rounded", name: "圆角" },
  { id: "square", name: "直角" },
];

const FONT_SIZE_OPTIONS: { id: IconFontSize; name: string }[] = [
  { id: "sm", name: "小" },
  { id: "md", name: "中" },
  { id: "lg", name: "大" },
];

const TEXT_ALIGN_OPTIONS: { id: IconTextAlign; name: string }[] = [
  { id: "left", name: "左" },
  { id: "center", name: "中" },
  { id: "right", name: "右" },
];

export interface AddIconPayload {
  groupId: string;
  name: string;
  url: string | null;
  sub: string | null;
  size: IconSize;
  letter: string | null;
  color: number;
  iframePreview: boolean;
  imageUrl: string | null;
  imageStyle: IconImageStyle;
  imageRadius: IconImageRadius;
  fontSize: IconFontSize;
  textAlign: IconTextAlign;
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

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
  const initialGroup = initialIcon?.groupId || editableGroups.find((g) => g.id === defaultGroupId)?.id || editableGroups[0]?.id || defaultGroupId;

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
  const [iframePreview, setIframePreview] = useState(initialIcon?.iframePreview ?? false);
  const [sourceMode, setSourceMode] = useState<IconSourceMode>(initSourceMode());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(sourceMode === "upload" ? (initialIcon?.imageUrl || null) : null);
  const [builtinIcon, setBuiltinIcon] = useState<(typeof BUILTIN_ICON_OPTIONS)[number]>(
    (parseBuiltinIconUrl(initialIcon?.imageUrl) as any) || "globe"
  );
  const [librarySelectedUrl, setLibrarySelectedUrl] = useState<string | null>(sourceMode === "library" ? (initialIcon?.imageUrl || null) : null);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [libraryIcons, setLibraryIcons] = useState<LibraryIconView[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string>("user_uploads");
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [fetchingLibs, setFetchingLibs] = useState(false);

  const [imageStyle, setImageStyle] = useState<IconImageStyle>(initialIcon?.imageStyle || "plain");
  const [imageRadius, setImageRadius] = useState<IconImageRadius>(initialIcon?.imageRadius || "rounded");
  const [fontSize, setFontSize] = useState<IconFontSize>(initialIcon?.fontSize || "md");
  const [textAlign, setTextAlign] = useState<IconTextAlign>(initialIcon?.textAlign || "center");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [autoImageUrls, setAutoImageUrls] = useState<{url: string, source: string}[]>([]);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());
  const [selectedAutoImageUrl, setSelectedAutoImageUrl] = useState<string | null>(null);
  const [isSearchingUrl, setIsSearchingUrl] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadLibraryIcons = useCallback((id: string, search: string) => {
    if (id === "user_uploads") {
      api.admin.getUserUploads(search).then(setLibraryIcons).catch(console.error);
    } else {
      api.admin.remoteIconAssets({ sourceId: id, limit: 1000, search: search || undefined }).then(res => {
        setLibraryIcons(res.items.map(r => ({
          id: r.id,
          libraryId: r.sourceId,
          name: r.title || 'icon',
          url: r.storageKey ? `/uploads/${r.storageKey}` : r.originalUrl,
          sha256: "",
          uploaderId: null,
          uploaderName: null,
          size: 0,
          contentType: "image/svg+xml",
          createdAt: r.fetchedAt,
          updatedAt: r.fetchedAt
        })));
      }).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (sourceMode === "library" && !librariesLoaded && !fetchingLibs) {
      setFetchingLibs(true);
      api.admin.iconAssetSources()
        .then(res => {
          setLibraries(res);
          setLibrariesLoaded(true);
          setFetchingLibs(false);
          loadLibraryIcons(activeLibraryId, debouncedSearchQuery);
        })
        .catch(() => setFetchingLibs(false));
    }
  }, [sourceMode, librariesLoaded, fetchingLibs, activeLibraryId, loadLibraryIcons, debouncedSearchQuery]);

  useEffect(() => {
    if (sourceMode === "library" && librariesLoaded) {
      loadLibraryIcons(activeLibraryId, debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, activeLibraryId, sourceMode, librariesLoaded, loadLibraryIcons]);

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
    api.faviconSearch(normalizedUrl).then((res) => {
      if (isCancelled) return;
      setAutoImageUrls(res);
      setFailedImageUrls(new Set());
      if (res.length > 0) setSelectedAutoImageUrl(res[0].url);
      else setSelectedAutoImageUrl(null);
    }).catch(console.error).finally(() => {
      if (!isCancelled) setIsSearchingUrl(false);
    });
    return () => { isCancelled = true; };
  }, [normalizedUrl, sourceMode]);
  const effectiveName = name.trim() || inferredName;
  const effectiveImageUrl =
    sourceMode === "upload" ? uploadedImageUrl
    : sourceMode === "builtin" ? buildBuiltinIconUrl(builtinIcon)
    : sourceMode === "library" ? librarySelectedUrl
    : sourceMode === "url" ? selectedAutoImageUrl
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
    letter: effectiveImageUrl ? null : (letter || null),
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

  const submit = () => {
    if (!canSave) return;
    onSave({
      groupId,
      name: effectiveName.trim(),
      url: normalizedUrl || url.trim() || null,
      sub: sub.trim() || null,
      size,
      letter: effectiveImageUrl ? null : (letter.trim() || null),
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
    <div className="wcc-backdrop" onClick={onClose}>
      <div className="wcc-modal glass-strong" onClick={(e) => e.stopPropagation()} style={{ width: 840, height: 'auto', maxHeight: '90vh' }}>
        
        <div className="wcc-head">
          <div className="wcc-tabs">
            <span className="active">{initialIcon ? "编辑图标" : "添加图标"}</span>
          </div>
          <button className="modal-close" onClick={onClose} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-soft)'}}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="wcc-body" style={{ padding: '32px', display: 'grid', gridTemplateColumns: 'minmax(240px, 1.1fr) 2fr', gap: '32px', alignItems: 'start', overflowY: 'auto' }}>
          
          {/* LEFT: Preview & Visuals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ 
               background: 'var(--glass-bg-strong)', 
               borderRadius: '24px', 
               padding: '28px 16px', 
               display: 'flex', flexDirection: 'column', alignItems: 'center', 
               border: '1px solid var(--border-color)',
               position: 'relative'
            }}>
              <div style={{ transform: 'scale(1.1)', transformOrigin: 'center' }}>
                <IconTile icon={preview} />
              </div>
              
              <div style={{ marginTop: '20px', display: 'flex', gap: '8px', width: '100%' }}>
                {SIZE_OPTIONS.map((o) => (
                  <button 
                    key={o.id} 
                    type="button" 
                    onClick={() => setSize(o.id)}
                    style={{ 
                      flex: 1, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      padding: '10px 4px', 
                      background: size === o.id ? 'var(--panel-bg)' : 'transparent',
                      border: '1px solid ' + (size === o.id ? 'var(--glass-border)' : 'transparent'),
                      borderRadius: '12px',
                      color: size === o.id ? 'var(--text)' : 'var(--text-soft)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24 }}>
                      <div style={{
                        width: o.id === 'lg' ? 20 : (o.id === 'pill-size' ? 24 : 16),
                        height: o.id === 'lg' ? 20 : 16,
                        borderRadius: o.id === 'circle-size' ? '50%' : (o.id === 'pill-size' ? '8px' : '4px'),
                        background: size === o.id ? 'var(--text)' : 'var(--text-mute)',
                        opacity: size === o.id ? 0.8 : 0.5,
                        transition: 'all 0.2s'
                      }} />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>主题色 Color</label>
              <div className="color-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 28px)', gap: '10px' }}>
                {DEFAULT_ICON_COLORS.map((c, i) => (
                  <div 
                    key={i} 
                    className={"color-swatch " + (color === i ? "active" : "")} 
                    style={{ 
                      background: c.bg, 
                      width: 28, 
                      height: 28, 
                      borderRadius: '50%',
                      boxShadow: color === i ? '0 0 0 2px var(--glass-bg-strong), 0 0 0 4px var(--text)' : '0 2px 8px rgba(0,0,0,0.2)',
                      border: 'none',
                      transition: 'all 200ms'
                    }} 
                    onClick={() => setColor(i)} 
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <label>回退字符 Letter</label>
              <input maxLength={3} value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="未获取图标时展示" />
            </div>
          </div>

          {/* RIGHT: Form Data */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <div className="field" style={{ width: "100%" }}>
                <label>名称 Name</label>
                <input autoFocus value={name} onChange={(e) => {setNameTouched(true); setName(e.target.value)}} placeholder="如 GitHub" />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>链接 URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>副标题 Sub</label>
              <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="显示在大图模式下方 (选填)" />
            </div>

            <div className="field" style={{ 
               marginTop: '6px',
               marginBottom: 0
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
                 {SOURCE_OPTIONS.map((opt) => (
                   <div 
                     key={opt.id}
                     className={"source-opt " + (sourceMode === opt.id ? "active" : "")}
                     onClick={() => setSourceMode(opt.id as any)}
                     style={{
                       display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                       padding: '14px 0', borderRadius: '12px', cursor: 'pointer',
                       transition: 'all 0.2s',
                     }}
                   >
                     <Icon name={opt.icon} size={20} />
                     <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt.name}</span>
                   </div>
                 ))}
              </div>

              {sourceMode === "url" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--panel-bg)", border: '1px solid var(--border-color)', flexShrink: 0 }}>
                      {selectedAutoImageUrl ? <img src={selectedAutoImageUrl} alt="" style={{ width: "70%", height: "70%", objectFit: "contain" }} /> : <Icon name={isSearchingUrl ? "activity" : "globe"} size={18} color="var(--text-soft)" />}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.6 }}>
                      {normalizedUrl ? (isSearchingUrl ? "正在深度检索站点图标..." : "已检索到图标候选，点击下方选择。") : "输入有效连结后，将自动尝试获取对应官方图标。"}
                    </div>
                  </div>
                  {autoImageUrls.filter(ic => !failedImageUrls.has(ic.url)).length > 0 && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                      {autoImageUrls.filter(ic => !failedImageUrls.has(ic.url)).map((icon, i) => (
                        <div key={i} 
                             className={"builtin-opt " + (selectedAutoImageUrl === icon.url ? "active" : "")} 
                             onClick={() => setSelectedAutoImageUrl(icon.url)}
                             title={icon.source}
                             style={{ background: selectedAutoImageUrl === icon.url ? 'var(--accent)' : 'var(--panel-bg)', borderColor: 'var(--border-color)', width: '100%', aspectRatio: '1', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          <img src={icon.url} style={{ maxWidth: 24, maxHeight: 24, objectFit: 'contain' }} onError={() => setFailedImageUrls(prev => new Set(prev).add(icon.url))} />
                          <span style={{ fontSize: 9, position: 'absolute', bottom: 2, color: 'var(--text-mute)' }}>{icon.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sourceMode === "upload" && (
                <div>
                  <input ref={fileRef} type="file" accept="image/*,.svg,.ico" className="hidden" onChange={(e) => { void uploadFile(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                  <div className={"upload-zone" + (dragOver ? " over" : "")} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); void uploadFile(e.dataTransfer.files?.[0] || null); }}
                       style={{ background: 'var(--panel-bg)', borderColor: 'var(--border-color)', padding: '24px 0' }}>
                    <Icon name={uploading ? "activity" : "plus"} size={24} color="var(--text-mute)" />
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>{uploading ? "上传中..." : uploadedImageUrl ? "已上传，点击替换" : "点击或拖拽上传"}</div>
                  </div>
                  {uploadedImageUrl && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: 'var(--text-mute)' }}>
                      <img src={uploadedImageUrl} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 8, background: "var(--panel-bg)", padding: 4 }} />
                      <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadedImageUrl}</div>
                      <button type="button" className="pill-btn" style={{ height: 28, fontSize: 12 }} onClick={() => setUploadedImageUrl(null)}>移除</button>
                    </div>
                  )}
                </div>
              )}

              {sourceMode === "builtin" && (
                <div className="builtin-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
                  {BUILTIN_ICON_OPTIONS.map((ic) => (
                    <div key={ic} className={"builtin-opt " + (builtinIcon === ic ? "active" : "")} onClick={() => setBuiltinIcon(ic)} title={ic}
                         style={{ background: builtinIcon === ic ? 'var(--accent)' : 'var(--panel-bg)', borderColor: 'var(--border-color)', width: 36, height: 36, borderRadius: 10 }}>
                      <Icon name={ic} size={16} color={builtinIcon === ic ? '#1a1a1a' : 'var(--text)'} />
                    </div>
                  ))}
                </div>
              )}

              {sourceMode === "library" && (
                <div>
                  <div className="tabs" style={{ background: 'var(--panel-bg)', overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', padding: 4 }}>
                    <button type="button" className={"tab " + (activeLibraryId === "user_uploads" ? "active" : "")} onClick={() => handleLibClick("user_uploads")}>
                      用户上传图库
                    </button>
                    {libraries.map(lib => (
                      <button key={lib.id} type="button" className={"tab " + (activeLibraryId === lib.id ? "active" : "")} onClick={() => handleLibClick(lib.id)}>
                        {lib.name}
                      </button>
                    ))}
                  </div>
                  <div className="search-box" style={{ display: "flex", alignItems: "center", background: "var(--panel-bg)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "2px 8px", marginTop: 12 }}>
                    <Icon name="search" size={14} color="var(--text-soft)" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索图标..."
                      style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, padding: "6px 8px", width: "100%", color: "var(--text)" }}
                    />
                  </div>
                  <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                    {libraryIcons.map(icon => (
                      <div key={icon.id} 
                           className={"builtin-opt " + (librarySelectedUrl === icon.url ? "active" : "")} 
                           onClick={() => setLibrarySelectedUrl(icon.url)}
                           title={icon.name}
                           style={{ background: librarySelectedUrl === icon.url ? 'var(--accent)' : 'var(--panel-bg)', borderColor: 'var(--border-color)', width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={icon.url} style={{ maxWidth: 28, maxHeight: 28, objectFit: 'contain' }} />
                      </div>
                    ))}
                    {libraryIcons.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-mute)', gridColumn: 'span 6', textAlign: 'center', padding: '20px 0' }}>该图库暂无可选图标</div>}
                  </div>
                </div>
              )}

              {sourceMode !== "letter" && (
                <div className="field-row" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', marginBottom: 0 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>外观</label>
                    <div className="tabs" style={{ background: 'var(--panel-bg)' }}>
                      {IMAGE_STYLE_OPTIONS.map((opt) => (
                        <button key={opt.id} type="button" className={"tab " + (imageStyle === opt.id ? "active" : "")} onClick={() => setImageStyle(opt.id)}>
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>边角</label>
                    <div className="tabs" style={{ background: 'var(--panel-bg)' }}>
                      {IMAGE_RADIUS_OPTIONS.map((opt) => (
                        <button key={opt.id} type="button" className={"tab " + (imageRadius === opt.id ? "active" : "")} onClick={() => setImageRadius(opt.id)}>
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="field-row" style={{ marginTop: '16px', marginBottom: 0 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>文字大小</label>
                  <div className="tabs" style={{ background: 'var(--panel-bg)' }}>
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <button key={opt.id} type="button" className={"tab " + (fontSize === opt.id ? "active" : "")} onClick={() => setFontSize(opt.id)}>
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>文字对齐</label>
                  <div className="tabs" style={{ background: 'var(--panel-bg)' }}>
                    {TEXT_ALIGN_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={"tab " + (textAlign === opt.id ? "active" : "")}
                        onClick={() => setTextAlign(opt.id)}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 'auto', fontSize: 13, color: 'var(--text-soft)', paddingBottom: 4 }} onClick={() => setIframePreview((v) => !v)}>
              <div className={"switch " + (iframePreview ? "on" : "")} />
              内嵌弹窗打开
            </label>
          </div>

        </div>
        
        <div className="wcc-foot" style={{ marginTop: 'auto' }}>
          <div className="wcc-dest">
             <span>添加至</span>
             <div className="wcc-dest-select glass" style={{ padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: '1px solid var(--glass-border-soft)' }}>
               <Icon name="folder" size={14} color="var(--text-soft)" />
               <select value={groupId} onChange={e => setGroupId(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none', appearance: 'none', paddingRight: '8px', fontWeight: 500, fontSize: '13px' }}>
                 {editableGroups.map(g => <option key={g.id} value={g.id} style={{ color: 'black' }}>{g.name}</option>)}
               </select>
               <Icon name="chevron-down" size={12} color="var(--text-soft)" />
             </div>
          </div>
          <button className="wcc-btn-cancel" onClick={onClose}>取消</button>
          <button className={"wcc-btn-add" + (canSave ? "" : " disabled")} onClick={submit}>
             保存图标
          </button>
        </div>
      </div>
    </div>
  );
}
