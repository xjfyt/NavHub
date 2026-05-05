import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { Icon } from "./Icon";
import { DocumentModal, TermsContent, PrivacyContent } from "./DocumentModal";
import { api } from "../api";
import { toast } from "sonner";
import type { UserMessage, CustomEngine, RemoteWallpaperItem, PublicWallpaperSource } from "../types";
import { BUILTIN_ENGINES, EngineLogo } from "../utils/engines";
import {
  composeShuffleInterval,
  decomposeShuffleInterval,
  DEFAULT_SHUFFLE_INTERVAL_SEC,
  formatShuffleInterval,
  normalizeShuffleInterval,
  type ShuffleIntervalUnit,
} from "../constants/wallpapers";

// ---------- Reusable rows ----------
const Row = ({ label, children, onClick }: { label: string; children?: React.ReactNode; onClick?: () => void }) => (
  <div className={"tw-row" + (onClick ? " tw-row-click" : "")} onClick={onClick}>
    <div className="tw-row-label">{label}</div>
    <div className="tw-row-ctrl">{children}</div>
  </div>
);

const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <button className={"tw-toggle" + (on ? " on" : "")} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
    <span className="tw-toggle-knob" />
  </button>
);

const Dropdown = ({ value, options, onChange }: { value: string; options: { id: string; name: string }[]; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = options.find((o) => o.id === value) || options[0];
  return (
    <div className="tw-dd" ref={ref}>
      <button className="tw-dd-trigger" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span>{cur?.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="tw-dd-menu">
          {options.map((o) => (
            <div key={o.id} className={"tw-dd-item" + (o.id === value ? " active" : "")} onClick={(e) => { e.stopPropagation(); onChange(o.id); setOpen(false); }}>
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Chevron = ({ value }: { value?: React.ReactNode }) => (
  <span className="tw-chev">
    {value != null && <span className="tw-chev-val">{value}</span>}
    <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

const SliderPopover = ({ title, items, onClose }: { title: string; items: any[]; onClose: () => void }) => (
  <div className="tw-sub">
    <div className="tw-sub-head">
      <button className="tw-sub-back" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <h3>{title}</h3>
      <div style={{ width: 24 }} />
    </div>
    <div className="tw-sub-body">
      {items.map((it, i) => (
        <div key={i} className="tw-slider-row">
          <div className="tw-slider-top">
            <span>{it.label}</span>
            <span className="tw-slider-val">{it.format ? it.format(it.value) : it.value}</span>
          </div>
          <input type="range" min={it.min} max={it.max} step={it.step || 1} value={String(it.value)} onChange={(e) => it.onChange(+e.target.value)} />
        </div>
      ))}
    </div>
  </div>
);

const WallpaperPreview = ({
  mediaType,
  url,
  posterUrl,
  className,
  emptyText,
}: {
  mediaType: "image" | "video";
  url?: string;
  posterUrl?: string;
  className: string;
  emptyText?: string;
}) => {
  if (!url) {
    return <div className={className}><span>{emptyText}</span></div>;
  }
  if (mediaType === "video") {
    return (
      <div className={className}>
        <video
          className="tw-wallpaper-video"
          src={url}
          poster={posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{
        backgroundImage: [
          "linear-gradient(180deg, rgba(10,14,20,0.15) 0%, rgba(10,14,20,0.42) 100%)",
          `url("${url}")`,
        ].join(", "),
      }}
    />
  );
};

// Nav icons (stroke style)
const navIcons = {
  general: <Icon name="settings" size={18} />,
  wallpaper: <Icon name="image" size={18} />,
  search: <Icon name="search" size={18} />,
  notify: <Icon name="bell" size={18} />,
  about: <Icon name="info" size={18} />,
  apps: <Icon name="grid" size={18} />,
  feedback: <Icon name="message-square" size={18} />,
};

export const TweaksPanel = ({ onClose }: { onClose: () => void }) => {
  const { me, workspace, updateTweaks, updateIcon, deleteIcon, addCustomEngine, deleteCustomEngine } = useWorkspace();
  const s = workspace.preferences.tweaks || {};
  const [activeNav, setActiveNav] = useState("general");
  const [sub, setSub] = useState<string | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [remoteWallpapers, setRemoteWallpapers] = useState<RemoteWallpaperItem[]>([]);
  const [remoteWallpaperTotal, setRemoteWallpaperTotal] = useState(0);
  const [remoteWallpapersLoading, setRemoteWallpapersLoading] = useState(false);
  const [wallpaperSearch, setWallpaperSearch] = useState("");
  const [wallpaperMediaFilter, setWallpaperMediaFilter] = useState<"" | "image" | "video">("");
  const [wallpaperSourceFilter, setWallpaperSourceFilter] = useState<string>("");
  const [wallpaperSources, setWallpaperSources] = useState<PublicWallpaperSource[]>([]);
  const [wallpaperPage, setWallpaperPage] = useState(0);
  const [detailWallpaper, setDetailWallpaper] = useState<RemoteWallpaperItem | null>(null);

  const set = (k: string, v: any) => {
    updateTweaks({ [k]: v });
    if (k === "glass") document.documentElement.style.setProperty("--glass-blur", v + "px");
  };

  useEffect(() => {
    if (activeNav !== "wallpaper") return;
    let alive = true;
    setRemoteWallpapersLoading(true);
    const delay = wallpaperSearch ? 300 : 0;
    const timer = setTimeout(() => {
      api.wallpapers({
        limit: 24,
        offset: wallpaperPage * 24,
        mediaType: wallpaperMediaFilter || undefined,
        sourceId: wallpaperSourceFilter || undefined,
        q: wallpaperSearch || undefined,
      })
        .then((resp) => {
          if (!alive) return;
          setRemoteWallpapers(resp.items);
          setRemoteWallpaperTotal(resp.total);
        })
        .catch(() => {
          if (!alive) return;
          setRemoteWallpapers([]);
          setRemoteWallpaperTotal(0);
        })
        .finally(() => { if (alive) setRemoteWallpapersLoading(false); });
    }, delay);
    return () => { alive = false; clearTimeout(timer); };
  }, [activeNav, wallpaperSearch, wallpaperMediaFilter, wallpaperSourceFilter, wallpaperPage]);

  useEffect(() => {
    if (activeNav !== "wallpaper") return;
    let alive = true;
    api.wallpaperSourcesPublic()
      .then((rows) => { if (alive) setWallpaperSources(rows); })
      .catch(() => { if (alive) setWallpaperSources([]); });
    return () => { alive = false; };
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "notify" || !me) return;
    let alive = true;
    setMessagesLoading(true);
    api.messages()
      .then((rows) => {
        if (alive) setMessages(rows);
      })
      .catch((e) => {
        console.error("load messages failed", e);
      })
      .finally(() => {
        if (alive) setMessagesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeNav, me]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const sidebarOpts = [
    { id: "autohide", name: "自动隐藏" },
    { id: "pinned", name: "一直显示" },
    { id: "hidden", name: "一直隐藏" },
  ];
  const sidebarPosOpts = [{ id: "left", name: "左侧" }, { id: "right", name: "右侧" }];
  const openOpts = [{ id: "newtab", name: "新标签页" }, { id: "current", name: "当前标签页" }];
  const iconSizeOpts = [{ id: "auto", name: "自动" }, { id: "lg", name: "大" }, { id: "md", name: "中" }, { id: "sm", name: "小" }];
  const modeOpts = [{ id: "light", name: "浅色" }, { id: "dark", name: "深色" }, { id: "auto", name: "跟随系统" }];
  const themeOpts = [
    { id: "dawn", name: "Dawn" }, { id: "ocean", name: "Ocean" },
    { id: "mist", name: "Mist" }, { id: "night", name: "Night" },
    { id: "daylight", name: "Daylight" }, { id: "cloud", name: "Cloud" }, { id: "sand", name: "Sand" }
  ];

  const navItems = [
    { id: "general", icon: navIcons.general, label: "常规设置" },
    { id: "wallpaper", icon: navIcons.wallpaper, label: "背景与壁纸" },
    { id: "search", icon: navIcons.search, label: "搜索引擎" },
    { id: "notify", icon: navIcons.notify, label: "消息通知" },
    { id: "about", icon: navIcons.about, label: "关于我们" },
  ];

  const renderGeneral = () => {
    if (sub === "iconWidth") {
      return <SliderPopover title="图标区域宽度" onClose={() => setSub(null)} items={[
        { label: "宽度", value: s.iconAreaWidth === undefined ? 0 : s.iconAreaWidth, min: 0, max: 2400, step: 20, format: (v: number) => v === 0 ? "全宽 (100%)" : v + "px", onChange: (v: number) => set("iconAreaWidth", v) },
      ]} />;
    }

    if (sub === "sidebarStyle") {
      return <SliderPopover title="侧边栏样式" onClose={() => setSub(null)} items={[
        { label: "宽度", value: s.sidebarWidth || 56, min: 48, max: 84, step: 2, format: (v: number) => v + "px", onChange: (v: number) => set("sidebarWidth", v) },
        { label: "分类间隔", value: s.sidebarGap || 6, min: 2, max: 18, step: 1, format: (v: number) => v + "px", onChange: (v: number) => set("sidebarGap", v) },
      ]} />;
    }
    if (sub === "searchBox") {
      return <SliderPopover title="搜索框样式" onClose={() => setSub(null)} items={[
        { label: "宽度", value: s.searchWidth || 560, min: 360, max: 820, step: 10, format: (v: number) => v + "px", onChange: (v: number) => set("searchWidth", v) },
        { label: "透明度", value: Math.round(((s.searchOpacity as number) ?? 0.55) * 100), min: 10, max: 100, step: 5, format: (v: number) => v + "%", onChange: (v: number) => set("searchOpacity", v / 100) },
      ]} />;
    }
    if (sub === "wheelSens") {
      return <SliderPopover title="翻页灵敏度" onClose={() => setSub(null)} items={[
        { label: "灵敏度", value: s.wheelSensitivity || 40, min: 10, max: 100, step: 1, onChange: (v: number) => set("wheelSensitivity", v) },
      ]} />;
    }
    return (
      <div className="tw-content">
        <div className="tw-section">
          <div className="tw-section-title">控制栏</div>
          <div className="tw-section-card">
            <Row label="侧边栏"><Dropdown value={(s.sidebar as string) || "autohide"} options={sidebarOpts} onChange={(v) => set("sidebar", v)} /></Row>
            <Row label="侧边栏位置"><Dropdown value={(s.sidebarPos as string) || "left"} options={sidebarPosOpts} onChange={(v) => set("sidebarPos", v)} /></Row>
            <Row label="侧边栏样式" onClick={() => setSub("sidebarStyle")}><Chevron value={`${(s.sidebarWidth as number) || 56}px · ${(s.sidebarGap as number) || 6}px`} /></Row>
          </div>
        </div>
        <div className="tw-section">
          <div className="tw-section-title">图标</div>
          <div className="tw-section-card">
            <Row label="打开方式"><Dropdown value={(s.iconOpen as string) || "newtab"} options={openOpts} onChange={(v) => set("iconOpen", v)} /></Row>
            <Row label="图标尺寸"><Dropdown value={(s.iconSize as string) || "auto"} options={iconSizeOpts} onChange={(v) => set("iconSize", v)} /></Row>
            <Row label="图标区域宽度" onClick={() => setSub("iconWidth")}><Chevron value={(s.iconAreaWidth === undefined || s.iconAreaWidth === 0) ? "全宽" : s.iconAreaWidth + "px"} /></Row>
            <Row label="隐藏添加图标"><Toggle on={!!s.hideAddIcon} onChange={(v) => set("hideAddIcon", v)} /></Row>
            <Row label="隐藏图标名称"><Toggle on={!!s.hideIconName} onChange={(v) => set("hideIconName", v)} /></Row>
            <Row label="滚动触发翻页"><Toggle on={s.wheelPage !== false} onChange={(v) => set("wheelPage", v)} /></Row>
          </div>
        </div>
        <div className="tw-section">
          <div className="tw-section-title">搜索</div>
          <div className="tw-section-card">
            <Row label="搜索框样式" onClick={() => setSub("searchBox")}><Chevron /></Row>
            <Row label="打开方式"><Dropdown value={(s.searchOpen as string) || "newtab"} options={openOpts} onChange={(v) => set("searchOpen", v)} /></Row>
            <Row label="搜索建议"><Toggle on={s.searchSuggest !== false} onChange={(v) => set("searchSuggest", v)} /></Row>
            <Row label="搜索历史"><Toggle on={!!s.searchHistory} onChange={(v) => set("searchHistory", v)} /></Row>
            <Row label="Tab键切换搜索引擎"><Toggle on={s.tabSwitchEngine !== false} onChange={(v) => set("tabSwitchEngine", v)} /></Row>
            <Row label="保留搜索框内容"><Toggle on={s.keepSearchText !== false} onChange={(v) => set("keepSearchText", v)} /></Row>
          </div>
        </div>
        <div className="tw-section">
          <div className="tw-section-title">其他设置</div>
          <div className="tw-section-card">
            <Row label="翻页灵敏度" onClick={() => setSub("wheelSens")}><Chevron value={s.wheelSensitivity as React.ReactNode || 40} /></Row>
            <Row label="使用系统默认字体"><Toggle on={s.useSystemFont !== false} onChange={(v) => set("useSystemFont", v)} /></Row>
            <Row label="显示备案号"><Toggle on={s.showBeian !== false} onChange={(v) => set("showBeian", v)} /></Row>
          </div>
        </div>
      </div>
    );
  };

  const applyRemoteWallpaper = (w: RemoteWallpaperItem) => {
    updateTweaks({
      backgroundMode: "wallpaper",
      wallpaperShuffle: false,
      wallpaperId: `remote-${w.id}`,
      wallpaperName: w.title ?? "在线动态壁纸",
      wallpaperUrl: w.url,
      wallpaperThumb: w.thumbnailUrl ?? w.url,
      wallpaperProvider: "远程壁纸库",
      wallpaperProviderUrl: w.pageUrl ?? "",
      wallpaperSourceUrl: w.pageUrl ?? w.url,
      wallpaperLicense: "",
      wallpaperAuthor: w.author ?? undefined,
      wallpaperMediaType: w.mediaType,
      wallpaperPosterUrl: w.thumbnailUrl ?? undefined,
    });
  };

  const enableShuffle = () => {
    updateTweaks({
      wallpaperShuffle: true,
      backgroundMode: undefined,
      wallpaperShuffleInterval: normalizeShuffleInterval(s.wallpaperShuffleInterval),
    });
  };

  const restoreGradient = () => {
    updateTweaks({ backgroundMode: "theme", wallpaperShuffle: false });
  };

  const renderWallpaper = () => {
    if (sub === "shuffleInterval") {
      const currentSec = normalizeShuffleInterval(s.wallpaperShuffleInterval);
      const { value: curValue, unit: curUnit } = decomposeShuffleInterval(currentSec);
      const unitOptions: { id: ShuffleIntervalUnit; name: string; max: number }[] = [
        { id: "s", name: "秒", max: 3600 },
        { id: "m", name: "分钟", max: 1440 },
        { id: "h", name: "小时", max: 720 },
        { id: "d", name: "天", max: 30 },
      ];
      return (
        <div className="tw-content">
          <div className="tw-section">
            <div className="tw-section-title">随机轮换间隔</div>
            <div className="tw-section-card">
              <div className="tw-row">
                <div className="tw-row-label">切换间隔</div>
                <div className="tw-row-ctrl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    aria-label="切换间隔数值"
                    title="切换间隔数值"
                    placeholder="1"
                    min={1}
                    max={unitOptions.find((u) => u.id === curUnit)?.max ?? 999}
                    value={curValue}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      set("wallpaperShuffleInterval", composeShuffleInterval(v, curUnit));
                    }}
                    style={{ width: 80, padding: "4px 8px", textAlign: "right",
                      background: "var(--admin-bg, transparent)", border: "1px solid var(--admin-border-str, rgba(255,255,255,0.1))",
                      borderRadius: 6, color: "var(--text)", fontSize: 13 }}
                  />
                  <Dropdown
                    value={curUnit}
                    options={unitOptions.map((u) => ({ id: u.id, name: u.name }))}
                    onChange={(v) => set("wallpaperShuffleInterval", composeShuffleInterval(curValue, v as ShuffleIntervalUnit))}
                  />
                </div>
              </div>
            </div>
            <div className="tw-custom-hint">
              当前：每 {formatShuffleInterval(currentSec)}从壁纸库中随机切换；最短 2 秒，最长 30 天。
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="tw-action-btn primary" onClick={() => setSub(null)}>完成</button>
            </div>
          </div>
        </div>
      );
    }
    const currentTheme = themeOpts.find((item) => item.id === ((s.theme as string) || "dawn")) || themeOpts[0];
    const wallpaperUrl = s.wallpaperUrl as string | undefined;
    const wallpaperMediaType = (s.wallpaperMediaType as "image" | "video" | undefined) ?? "image";
    const wallpaperPosterUrl = s.wallpaperPosterUrl as string | undefined;
    const shuffleOn = s.wallpaperShuffle !== false && s.backgroundMode !== "theme";
    const shuffleInterval = normalizeShuffleInterval(s.wallpaperShuffleInterval);
    const wallpaperActive = s.backgroundMode === "wallpaper" && !!wallpaperUrl && !shuffleOn;
    const active = shuffleOn || wallpaperActive;
    const themeActive = !active;
    const activePreviewUrl = wallpaperActive ? wallpaperUrl : undefined;
    const activePreviewPoster = wallpaperActive ? wallpaperPosterUrl : undefined;

    return (
      <div className="tw-content">
        <div className="tw-section">
          <div className="tw-section-title">界面风格</div>
          <div className="tw-section-card">
            <Row label="明暗模式"><Dropdown value={(s.mode as string) || "auto"} options={modeOpts} onChange={(v) => set("mode", v)} /></Row>
            <Row label="毛玻璃强度">
              <input type="range" className="tw-inline-range" min={0} max={40} step={2} value={(s.glass as number) || 2} onChange={(e) => set("glass", +e.target.value)} />
            </Row>
          </div>
        </div>

        <div className="tw-section">
          <div className="tw-section-title">当前背景</div>
          <div className="tw-wallpaper-hero">
            <WallpaperPreview
              mediaType={wallpaperMediaType}
              url={activePreviewUrl}
              posterUrl={activePreviewPoster}
              className={"tw-wallpaper-preview" + ((active || themeActive) ? " active" : "")}
              emptyText={shuffleOn ? `随机壁纸 · 每 ${formatShuffleInterval(shuffleInterval)}切换` : `当前未设置壁纸`}
            />
            <div className="tw-wallpaper-summary">
              <div className="tw-wallpaper-head">
                <div>
                  <div className="tw-wallpaper-name">
                    {shuffleOn
                      ? "随机壁纸轮换中"
                      : wallpaperActive
                        ? ((s.wallpaperName as string) || "壁纸")
                        : `默认背景`}
                  </div>
                  <div className="tw-wallpaper-meta">
                    {shuffleOn
                      ? `每 ${formatShuffleInterval(shuffleInterval)}从壁纸库随机切换，选中具体壁纸后自动关闭。`
                      : wallpaperActive
                        ? [
                            wallpaperMediaType === "video" ? "动态壁纸" : "静态壁纸",
                            s.wallpaperProvider as string,
                            s.wallpaperAuthor as string,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "当前为默认背景，可在下方壁纸库中挑选喜欢的壁纸。"}
                  </div>
                </div>
                <span className={"tw-wallpaper-state" + ((active || themeActive) ? " on" : "")}>
                  {shuffleOn ? "轮换中" : wallpaperActive ? "壁纸中" : "默认"}
                </span>
              </div>
              <div className="tw-wallpaper-actions">
                <button className="tw-action-btn primary" onClick={enableShuffle}>
                  {shuffleOn ? "已开启随机" : "随机壁纸"}
                </button>
                <button className="tw-action-btn" onClick={restoreGradient}>清除壁纸</button>
                {wallpaperActive && (s.wallpaperSourceUrl as string) ? (
                  <a
                    className="tw-action-btn link"
                    href={s.wallpaperSourceUrl as string}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看来源
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="tw-section">
          <div className="tw-section-title">随机壁纸</div>
          <div className="tw-section-card">
            <Row label="自动轮换">
              <Toggle
                on={shuffleOn}
                onChange={(v) => {
                  if (v) {
                    updateTweaks({
                      wallpaperShuffle: true,
                      backgroundMode: undefined,
                      wallpaperShuffleInterval: shuffleInterval,
                    });
                  } else {
                    set("wallpaperShuffle", false);
                  }
                }}
              />
            </Row>
            <Row label="切换间隔" onClick={() => setSub("shuffleInterval")}>
              <Chevron value={formatShuffleInterval(shuffleInterval)} />
            </Row>
            <Row label="壁纸类型">
              <Dropdown
                value={(s.wallpaperShuffleMediaType as string) || ""}
                options={[
                  { id: "", name: "混合随机" },
                  { id: "image", name: "仅静态壁纸" },
                  { id: "video", name: "仅动态壁纸" },
                ]}
                onChange={(v) => set("wallpaperShuffleMediaType", v)}
              />
            </Row>
            <Row label="壁纸来源">
              <Dropdown
                value={(s.wallpaperShuffleSource as string) || ""}
                options={[
                  { id: "", name: "全部来源" },
                  ...wallpaperSources.map(src => ({ id: src.id, name: src.name }))
                ]}
                onChange={(v) => set("wallpaperShuffleSource", v)}
              />
            </Row>
          </div>
          <div className="tw-custom-hint">
            开启后按设定间隔及筛选条件，自动轮换壁纸库中的在线壁纸；选中具体壁纸后自动关闭。
          </div>
        </div>

        <div className="tw-section">
          <div className="tw-section-title">壁纸库</div>

          {/* Search + filter bar */}
          <div className="tw-wallpaper-toolbar">
            <div className="tw-wallpaper-search">
              <Icon name="search" size={13} />
              <input
                type="search"
                placeholder="搜索壁纸..."
                value={wallpaperSearch}
                onChange={(e) => { setWallpaperSearch(e.target.value); setWallpaperPage(0); }}
              />
            </div>
            <div className="tw-wallpaper-filter">
              {(["", "image", "video"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={"tw-filter-btn" + (wallpaperMediaFilter === f ? " active" : "")}
                  onClick={() => { setWallpaperMediaFilter(f); setWallpaperPage(0); }}
                >
                  {f === "" ? "全部" : f === "image" ? "静态" : "动态"}
                </button>
              ))}
            </div>
          </div>

          {wallpaperSources.length > 0 && (
            <div className="tw-wallpaper-sources">
              <button
                type="button"
                className={"tw-filter-btn" + (wallpaperSourceFilter === "" ? " active" : "")}
                onClick={() => { setWallpaperSourceFilter(""); setWallpaperPage(0); }}
              >
                全部来源
              </button>
              {wallpaperSources.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  className={"tw-filter-btn" + (wallpaperSourceFilter === src.id ? " active" : "")}
                  onClick={() => { setWallpaperSourceFilter(src.id); setWallpaperPage(0); }}
                  title={`${src.name} · ${src.totalCount} 张`}
                >
                  {src.name}
                  <span className="tw-filter-badge">{src.totalCount}</span>
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          {remoteWallpapersLoading ? (
            <div className="tw-wallpaper-loading">加载中...</div>
          ) : remoteWallpapers.length === 0 ? (
            <div className="tw-wallpaper-loading">
              {wallpaperSearch
                ? `未找到「${wallpaperSearch}」相关壁纸`
                : wallpaperSourceFilter
                  ? "该来源暂无符合条件的壁纸"
                  : "暂无壁纸，管理员可在后台壁纸库中添加来源"}
            </div>
          ) : (
            <div className="tw-wallpaper-grid">
              {remoteWallpapers.map((w) => {
                const isActive = (s.wallpaperId as string | undefined) === `remote-${w.id}`;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={"tw-wallpaper-card" + (isActive ? " active" : "")}
                    onClick={() => setDetailWallpaper(w)}
                    title={w.title ?? "壁纸"}
                  >
                    {w.thumbnailUrl ? (
                      <div className={"tw-wallpaper-thumb" + (w.mediaType === "video" ? " tw-wallpaper-thumb-video" : "")}>
                        <img
                          src={w.thumbnailUrl}
                          alt={w.title ?? ""}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        {w.mediaType === "video" && (
                          <span className="tw-wallpaper-play"><Icon name="play" size={14} /></span>
                        )}
                      </div>
                    ) : (
                      <div className="tw-wallpaper-thumb tw-wallpaper-thumb-empty">
                        <Icon name={w.mediaType === "video" ? "play" : "image"} size={18} />
                      </div>
                    )}
                    <div className="tw-wallpaper-card-body">
                      <div className="tw-wallpaper-card-top">
                        <div className="tw-wallpaper-card-name tw-wallpaper-name-truncate">{w.title ?? "壁纸"}</div>
                        <div className="tw-wallpaper-badges">
                          {w.mediaType === "video" && <span className="tw-wallpaper-kind">动态</span>}
                          {isActive && <span className="tw-wallpaper-tag">当前</span>}
                        </div>
                      </div>
                      {w.author && <div className="tw-wallpaper-card-meta tw-wallpaper-name-truncate">{w.author}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {remoteWallpaperTotal > 0 && (() => {
            const totalPages = Math.max(1, Math.ceil(remoteWallpaperTotal / 24));
            return (
              <div className="tw-wallpaper-pager">
                <button
                  type="button"
                  className="tw-action-btn"
                  disabled={wallpaperPage === 0}
                  onClick={() => setWallpaperPage((p) => Math.max(0, p - 1))}
                >
                  上一页
                </button>
                <span className="tw-pager-label">
                  第 {wallpaperPage + 1} / {totalPages} 页 · 共 {remoteWallpaperTotal} 张
                </span>
                <button
                  type="button"
                  className="tw-action-btn"
                  disabled={wallpaperPage + 1 >= totalPages}
                  onClick={() => setWallpaperPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            );
          })()}
        </div>

        {/* Wallpaper detail modal (read-only with apply) */}
        {detailWallpaper && (
          <div
            className="tw-wallpaper-detail-mask"
            onClick={() => setDetailWallpaper(null)}
          >
            <div className="tw-wallpaper-detail" onClick={(e) => e.stopPropagation()}>
              {detailWallpaper.thumbnailUrl ? (
                <img
                  className="tw-wallpaper-detail-img"
                  src={detailWallpaper.thumbnailUrl}
                  alt={detailWallpaper.title ?? ""}
                />
              ) : (
                <div className="tw-wallpaper-detail-img tw-wallpaper-thumb-empty">
                  <Icon name={detailWallpaper.mediaType === "video" ? "play" : "image"} size={24} />
                </div>
              )}
              <div className="tw-wallpaper-detail-body">
                <div className="tw-wallpaper-detail-name">{detailWallpaper.title ?? "未命名壁纸"}</div>
                <div className="tw-wallpaper-detail-meta">
                  {[
                    detailWallpaper.mediaType === "video" ? "动态壁纸" : "静态壁纸",
                    detailWallpaper.sourceName,
                    detailWallpaper.author,
                  ].filter(Boolean).join(" · ")}
                </div>
                {detailWallpaper.fetchedAt && (
                  <div className="tw-wallpaper-detail-meta">
                    抓取时间：{new Date(detailWallpaper.fetchedAt).toLocaleString("zh-CN")}
                  </div>
                )}
                {detailWallpaper.pageUrl && (
                  <div className="tw-wallpaper-detail-meta">
                    <a href={detailWallpaper.pageUrl} target="_blank" rel="noreferrer">
                      查看来源页面
                    </a>
                  </div>
                )}
                <div className="tw-wallpaper-detail-actions">
                  <button
                    type="button"
                    className="tw-action-btn"
                    onClick={() => setDetailWallpaper(null)}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    className="tw-action-btn primary"
                    onClick={() => {
                      applyRemoteWallpaper(detailWallpaper);
                      setDetailWallpaper(null);
                    }}
                  >
                    应用此壁纸
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSearch = () => {
    if (sub === "addCustomEngine") {
      return (
        <form className="tw-content" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = fd.get("name") as string;
          const url = fd.get("url") as string;
          if (!name || (!url.includes("{q}"))) return toast.error("名称不能为空，且 URL 必须包含 {q}");
          const colors = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899"];
          const color = colors[Math.floor(Math.random() * colors.length)];
          addCustomEngine({ name, url, color }).then(() => {
            setSub(null);
            toast.success("已添加搜索引擎");
          }).catch((err: any) => toast.error("添加失败: " + err.message));
        }}>
          <div className="tw-section">
            <div className="tw-section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => setSub(null)}><Icon name="chevron-left" size={16} /></button>
              添加自定义搜索引擎
            </div>
            <div className="tw-section-card">
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 6 }}>名称</div>
                  <input name="name" className="nh-input" required placeholder="如：GitHub" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border-soft)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 6 }}>搜索 URL</div>
                  <input name="url" className="nh-input" required placeholder="包含 {q}，如：https://github.com/search?q={q}" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border-soft)' }} />
                </div>
                <button type="submit" className="pill-btn primary" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>保存并添加</button>
              </div>
            </div>
          </div>
        </form>
      );
    }

    const customEngines = Array.isArray(workspace.preferences.customEngines)
      ? (workspace.preferences.customEngines as CustomEngine[])
      : [];

    const allEngines = [...Object.values(BUILTIN_ENGINES), ...customEngines];

    return (
      <div className="tw-content">
        <div className="tw-section">
          <div className="tw-section-title">默认搜索引擎</div>
          <div className="tw-section-card" style={{ padding: 0 }}>
            {allEngines.map((e) => {
              const isCustom = !('builtin' in e) || !e.builtin;
              return (
                <div key={e.id} className="tw-row tw-row-click" style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-border-soft)' }} onClick={() => set("searchEngine", e.id)}>
                  <div className="tw-row-label" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <EngineLogo engine={e as any} size={20} />
                    <span>{e.name}</span>
                  </div>
                  <div className="tw-row-ctrl" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isCustom && (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); deleteCustomEngine(e.id); }} style={{ color: 'var(--danger)', padding: 4 }}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                    {s.searchEngine === e.id ? <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 8l3 3 5-6" stroke="#007aff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : <div style={{width:16,height:16}}/>}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="pill-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setSub("addCustomEngine")}>
            <Icon name="plus" size={14} /> 添加自定义搜索引擎
          </button>
        </div>
      </div>
    );
  };

  const renderNotify = () => {
    if (!me) {
      return renderPlaceholder("消息通知", "登录后可查看管理员推送给你的系统消息。");
    }

    const unreadCount = messages.filter((msg) => !msg.readAt).length;
    const levelStyle = (level: UserMessage["level"]) => {
      if (level === "success") return { background: "rgba(62,190,120,0.16)", color: "#8ee6b8" };
      if (level === "warning") return { background: "rgba(255,196,87,0.16)", color: "#ffd778" };
      if (level === "error") return { background: "rgba(255,110,110,0.16)", color: "#ff9b9b" };
      return { background: "rgba(120,180,255,0.16)", color: "#8fb8ff" };
    };
    const targetText = (msg: UserMessage) => {
      if (msg.targetType === "all") return "面向全体用户";
      if (msg.targetType === "role") return `面向角色：${msg.targetRole || "未知角色"}`;
      return "定向发送给你";
    };

    const markRead = async (id: string) => {
      setMessages((rows) => rows.map((row) => (row.id === id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row)));
      try {
        await api.markMessageRead(id);
      } catch (e) {
        console.error("markMessageRead failed", e);
      }
    };

    const markAllRead = async () => {
      setMessages((rows) => rows.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString() })));
      try {
        await api.markAllMessagesRead();
      } catch (e) {
        console.error("markAllMessagesRead failed", e);
      }
    };

    return (
      <div className="tw-content">
        <div className="tw-section">
          <div className="tw-section-title">系统消息</div>
          <div className="tw-wallpaper-hero" style={{ gap: 16, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="tw-wallpaper-name">你有 {unreadCount} 条未读消息</div>
              <div className="tw-wallpaper-meta">管理员发送的维护通知、公告和定向提醒都会出现在这里。</div>
            </div>
            <div className="tw-wallpaper-actions">
              <button className="tw-action-btn primary" onClick={markAllRead} disabled={messages.length === 0}>全部标为已读</button>
            </div>
          </div>
        </div>

        <div className="tw-section">
          <div className="tw-section-title">收件箱</div>
          <div style={{ display: "grid", gap: 12 }}>
            {messagesLoading ? (
              <div className="tw-empty">
                <div className="tw-empty-title">加载中</div>
                <div className="tw-empty-sub">正在拉取最新消息。</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="tw-empty">
                <div className="tw-empty-title">暂无消息</div>
                <div className="tw-empty-sub">管理员推送的公告会显示在这里。</div>
              </div>
            ) : messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  borderRadius: 18,
                  border: msg.readAt ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,215,165,0.34)",
                  background: msg.readAt ? "rgba(255,255,255,0.03)" : "rgba(255,215,165,0.08)",
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ ...levelStyle(msg.level), padding: "3px 8px", borderRadius: 999, fontSize: 11 }}>
                        {{ info: "普通", success: "成功", warning: "提醒", error: "紧急" }[msg.level]}
                      </span>
                      {!msg.readAt ? <span className="tw-wallpaper-tag">未读</span> : null}
                      <span style={{ fontSize: 11, color: "var(--text-mute)" }}>{targetText(msg)}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{msg.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-soft)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginTop: 8 }}>{msg.content}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: "var(--text-mute)" }}>
                      <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      <span>发布者：{msg.createdByName || "系统"}</span>
                    </div>
                  </div>
                  {!msg.readAt ? (
                    <button className="tw-action-btn" onClick={() => markRead(msg.id)}>标为已读</button>
                  ) : null}
                </div>
                {msg.linkUrl ? (
                  <div style={{ marginTop: 12 }}>
                    <a className="tw-action-btn link" href={msg.linkUrl} target="_blank" rel="noreferrer">打开附带链接</a>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPlaceholder = (title: string, text: string) => (
    <div className="tw-content">
      <div className="tw-empty">
        <div className="tw-empty-title">{title}</div>
        <div className="tw-empty-sub">{text}</div>
      </div>
    </div>
  );

  let content = null;
  if (activeNav === "general") content = renderGeneral();
  else if (activeNav === "search") content = renderSearch();
  else if (activeNav === "wallpaper") content = renderWallpaper();
  else if (activeNav === "notify") content = renderNotify();
  else if (activeNav === "about") content = renderPlaceholder("关于我们", "版本信息、更新日志、开源协议。");

  const userInitial = ((me?.displayName || me?.username) || "U").charAt(0).toUpperCase();
  const userName = me?.displayName || me?.username || "访客";

  const [docModal, setDocModal] = useState<"terms" | "privacy" | null>(null);

  return (
    <div className="tw-overlay" onClick={onClose}>
      <div className="tw-modal" onClick={(e) => e.stopPropagation()}>
        {/* Left nav */}
        <aside className="tw-nav">
          <div className="tw-nav-user">
            <div className="tw-avatar" style={{ background: "linear-gradient(135deg, #ffd7a5, #c98a68)" }}>{userInitial}</div>
            <div className="tw-user-name">{userName}</div>
          </div>
          <nav className="tw-nav-list">
            {navItems.map((it) => (
              <button key={it.id} className={"tw-nav-item" + (activeNav === it.id ? " active" : "")} onClick={() => { setActiveNav(it.id); setSub(null); }}>
                <span className="tw-nav-ico">{it.icon}</span>
                <span className="tw-nav-label">{it.label}</span>
              </button>
            ))}
          </nav>
          <div className="tw-nav-foot">
            <div className="tw-version" style={{marginBottom: 4}}>V0.1.0</div>
            <div className="tw-foot-links">
              <a href="#" onClick={(e) => { e.preventDefault(); setDocModal("terms"); }}>用户协议</a>
              <span>·</span>
              <a href="#" onClick={(e) => { e.preventDefault(); setDocModal("privacy"); }}>隐私政策</a>
            </div>
          </div>
        </aside>
        {/* Right content */}
        <main className="tw-main">
          <button className="tw-close" onClick={onClose} aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          {content}
        </main>
      </div>

      {docModal === "terms" && (
        <DocumentModal title="用户协议" content={<TermsContent />} onClose={() => setDocModal(null)} />
      )}
      {docModal === "privacy" && (
        <DocumentModal title="隐私政策" content={<PrivacyContent />} onClose={() => setDocModal(null)} />
      )}
    </div>
  );
};
