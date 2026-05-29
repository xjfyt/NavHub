import { useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { Icon } from "./Icon";
import { DocumentModal, TermsContent, PrivacyContent } from "./DocumentModal";
import { api } from "../api";
import type {
  UserMessage,
  CustomEngine,
  RemoteWallpaperItem,
  PublicWallpaperSource,
} from "../types";
import {
  composeShuffleInterval,
  decomposeShuffleInterval,
  formatShuffleInterval,
  normalizeShuffleInterval,
  type ShuffleIntervalUnit,
} from "../constants/wallpapers";
import {
  Row,
  Toggle,
  Dropdown,
  Chevron,
  WallpaperPreview,
} from "./TweaksPanelParts";
import {
  WallpaperGridPreview,
  WallpaperDetailPreview,
} from "./tweaks/WallpaperPreviews";
import { modeOpts, navItems } from "./tweaks/constants";
import { GeneralSection } from "./tweaks/GeneralSection";
import { NotifySection } from "./tweaks/NotifySection";
import { AboutSection } from "./tweaks/AboutSection";
import { SearchSection } from "./tweaks/SearchSection";

export const TweaksPanel = ({ onClose }: { onClose: () => void }) => {
  const {
    me,
    workspace,
    updateTweaks,
    addCustomEngine,
    updateCustomEngine,
    deleteCustomEngine,
  } = useWorkspace();
  const s = workspace.preferences.tweaks || {};
  const [activeNav, setActiveNav] = useState("general");
  const [sub, setSub] = useState<string | null>(null);
  // UX-7: 正在编辑的自定义引擎(null = 新增模式)。
  const [editingEngine, setEditingEngine] = useState<CustomEngine | null>(null);
  const [docModal, setDocModal] = useState<"terms" | "privacy" | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [remoteWallpapers, setRemoteWallpapers] = useState<
    RemoteWallpaperItem[]
  >([]);
  const [remoteWallpaperTotal, setRemoteWallpaperTotal] = useState(0);
  const [remoteWallpapersLoading, setRemoteWallpapersLoading] = useState(false);
  const [wallpaperSearch, setWallpaperSearch] = useState("");
  const [wallpaperMediaFilter, setWallpaperMediaFilter] = useState<
    "" | "image" | "video"
  >("");
  const [wallpaperSourceFilter, setWallpaperSourceFilter] =
    useState<string>("");
  const [wallpaperSources, setWallpaperSources] = useState<
    PublicWallpaperSource[]
  >([]);
  const [wallpaperPage, setWallpaperPage] = useState(0);
  const [detailWallpaper, setDetailWallpaper] =
    useState<RemoteWallpaperItem | null>(null);

  const set = (k: string, v: any) => {
    updateTweaks({ [k]: v });
    if (k === "glass")
      document.documentElement.style.setProperty("--glass-blur", v + "px");
  };

  useEffect(() => {
    if (activeNav !== "wallpaper") return;
    let alive = true;
    setRemoteWallpapersLoading(true);
    const delay = wallpaperSearch ? 300 : 0;
    const timer = setTimeout(() => {
      api
        .wallpapers({
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
        .finally(() => {
          if (alive) setRemoteWallpapersLoading(false);
        });
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    activeNav,
    wallpaperSearch,
    wallpaperMediaFilter,
    wallpaperSourceFilter,
    wallpaperPage,
  ]);

  useEffect(() => {
    if (activeNav !== "wallpaper") return;
    let alive = true;
    api
      .wallpaperSourcesPublic()
      .then((rows) => {
        if (alive) setWallpaperSources(rows);
      })
      .catch(() => {
        if (alive) setWallpaperSources([]);
      });
    return () => {
      alive = false;
    };
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "notify" || !me) return;
    let alive = true;
    setMessagesLoading(true);
    api
      .messages()
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
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

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
      wallpaperShuffleInterval: normalizeShuffleInterval(
        s.wallpaperShuffleInterval,
      ),
    });
  };

  const restoreGradient = () => {
    updateTweaks({ backgroundMode: "theme", wallpaperShuffle: false });
  };

  const renderWallpaper = () => {
    if (sub === "shuffleInterval") {
      const currentSec = normalizeShuffleInterval(s.wallpaperShuffleInterval);
      const { value: curValue, unit: curUnit } =
        decomposeShuffleInterval(currentSec);
      const unitOptions: {
        id: ShuffleIntervalUnit;
        name: string;
        max: number;
      }[] = [
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
                <div
                  className="tw-row-ctrl"
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
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
                      set(
                        "wallpaperShuffleInterval",
                        composeShuffleInterval(v, curUnit),
                      );
                    }}
                    style={{
                      width: 80,
                      padding: "4px 8px",
                      textAlign: "right",
                      background: "var(--admin-bg, transparent)",
                      border:
                        "1px solid var(--admin-border-str, rgba(255,255,255,0.1))",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 13,
                    }}
                  />
                  <Dropdown
                    value={curUnit}
                    options={unitOptions.map((u) => ({
                      id: u.id,
                      name: u.name,
                    }))}
                    onChange={(v) =>
                      set(
                        "wallpaperShuffleInterval",
                        composeShuffleInterval(
                          curValue,
                          v as ShuffleIntervalUnit,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            </div>
            <div className="tw-custom-hint">
              当前：每 {formatShuffleInterval(currentSec)}
              从壁纸库中随机切换；最短 2 秒，最长 30 天。
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                className="tw-action-btn primary"
                onClick={() => setSub(null)}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      );
    }
    const wallpaperUrl = s.wallpaperUrl as string | undefined;
    const wallpaperMediaType =
      (s.wallpaperMediaType as "image" | "video" | undefined) ?? "image";
    const wallpaperPosterUrl = s.wallpaperPosterUrl as string | undefined;
    const shuffleOn =
      s.wallpaperShuffle !== false && s.backgroundMode !== "theme";
    const shuffleInterval = normalizeShuffleInterval(
      s.wallpaperShuffleInterval,
    );
    const wallpaperActive =
      s.backgroundMode === "wallpaper" && !!wallpaperUrl && !shuffleOn;
    const active = shuffleOn || wallpaperActive;
    const themeActive = !active;
    const activePreviewUrl = wallpaperActive ? wallpaperUrl : undefined;
    const activePreviewPoster = wallpaperActive
      ? wallpaperPosterUrl
      : undefined;

    return (
      <div className="tw-content">
        <div className="tw-section">
          <div className="tw-section-title">界面风格</div>
          <div className="tw-section-card">
            <Row label="明暗模式">
              <Dropdown
                value={(s.mode as string) || "auto"}
                options={modeOpts}
                onChange={(v) => set("mode", v)}
              />
            </Row>
            <Row label="毛玻璃强度">
              <input
                type="range"
                aria-label="毛玻璃强度"
                className="tw-inline-range"
                min={0}
                max={40}
                step={2}
                value={(s.glass as number) || 2}
                onChange={(e) => set("glass", +e.target.value)}
              />
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
              className={
                "tw-wallpaper-preview" +
                (active || themeActive ? " active" : "")
              }
              emptyText={
                shuffleOn
                  ? `随机壁纸 · 每 ${formatShuffleInterval(shuffleInterval)}切换`
                  : `当前未设置壁纸`
              }
            />
            <div className="tw-wallpaper-summary">
              <div className="tw-wallpaper-head">
                <div>
                  <div className="tw-wallpaper-name">
                    {shuffleOn
                      ? "随机壁纸轮换中"
                      : wallpaperActive
                        ? (s.wallpaperName as string) || "壁纸"
                        : `默认背景`}
                  </div>
                  <div className="tw-wallpaper-meta">
                    {shuffleOn
                      ? `每 ${formatShuffleInterval(shuffleInterval)}从壁纸库随机切换，选中具体壁纸后自动关闭。`
                      : wallpaperActive
                        ? [
                            wallpaperMediaType === "video"
                              ? "动态壁纸"
                              : "静态壁纸",
                            s.wallpaperProvider as string,
                            s.wallpaperAuthor as string,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "当前为默认背景，可在下方壁纸库中挑选喜欢的壁纸。"}
                  </div>
                </div>
                <span
                  className={
                    "tw-wallpaper-state" + (active || themeActive ? " on" : "")
                  }
                >
                  {shuffleOn ? "轮换中" : wallpaperActive ? "壁纸中" : "默认"}
                </span>
              </div>
              <div className="tw-wallpaper-actions">
                <button
                  className="tw-action-btn primary"
                  onClick={enableShuffle}
                >
                  {shuffleOn ? "已开启随机" : "随机壁纸"}
                </button>
                <button className="tw-action-btn" onClick={restoreGradient}>
                  清除壁纸
                </button>
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
                  ...wallpaperSources.map((src) => ({
                    id: src.id,
                    name: src.name,
                  })),
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
                aria-label="搜索壁纸"
                placeholder="搜索壁纸..."
                value={wallpaperSearch}
                onChange={(e) => {
                  setWallpaperSearch(e.target.value);
                  setWallpaperPage(0);
                }}
              />
            </div>
            <div className="tw-wallpaper-filter">
              {(["", "image", "video"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={
                    "tw-filter-btn" +
                    (wallpaperMediaFilter === f ? " active" : "")
                  }
                  onClick={() => {
                    setWallpaperMediaFilter(f);
                    setWallpaperPage(0);
                  }}
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
                className={
                  "tw-filter-btn" +
                  (wallpaperSourceFilter === "" ? " active" : "")
                }
                onClick={() => {
                  setWallpaperSourceFilter("");
                  setWallpaperPage(0);
                }}
              >
                全部来源
              </button>
              {wallpaperSources.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  className={
                    "tw-filter-btn" +
                    (wallpaperSourceFilter === src.id ? " active" : "")
                  }
                  onClick={() => {
                    setWallpaperSourceFilter(src.id);
                    setWallpaperPage(0);
                  }}
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
                const isActive =
                  (s.wallpaperId as string | undefined) === `remote-${w.id}`;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={
                      "tw-wallpaper-card" + (isActive ? " active" : "")
                    }
                    onClick={() => setDetailWallpaper(w)}
                    title={w.title ?? "壁纸"}
                  >
                    <WallpaperGridPreview wallpaper={w} />
                    <div className="tw-wallpaper-card-body">
                      <div className="tw-wallpaper-card-top">
                        <div className="tw-wallpaper-card-name tw-wallpaper-name-truncate">
                          {w.title ?? "壁纸"}
                        </div>
                        <div className="tw-wallpaper-badges">
                          {w.mediaType === "video" && (
                            <span className="tw-wallpaper-kind">动态</span>
                          )}
                          {isActive && (
                            <span className="tw-wallpaper-tag">当前</span>
                          )}
                        </div>
                      </div>
                      {w.author && (
                        <div className="tw-wallpaper-card-meta tw-wallpaper-name-truncate">
                          {w.author}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {remoteWallpaperTotal > 0 &&
            (() => {
              const totalPages = Math.max(
                1,
                Math.ceil(remoteWallpaperTotal / 24),
              );
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
                    第 {wallpaperPage + 1} / {totalPages} 页 · 共{" "}
                    {remoteWallpaperTotal} 张
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
            <div
              className="tw-wallpaper-detail"
              onClick={(e) => e.stopPropagation()}
            >
              <WallpaperDetailPreview wallpaper={detailWallpaper} />
              <div className="tw-wallpaper-detail-body">
                <div className="tw-wallpaper-detail-name">
                  {detailWallpaper.title ?? "未命名壁纸"}
                </div>
                <div className="tw-wallpaper-detail-meta">
                  {[
                    detailWallpaper.mediaType === "video"
                      ? "动态壁纸"
                      : "静态壁纸",
                    detailWallpaper.sourceName,
                    detailWallpaper.author,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {detailWallpaper.fetchedAt && (
                  <div className="tw-wallpaper-detail-meta">
                    抓取时间：
                    {new Date(detailWallpaper.fetchedAt).toLocaleString(
                      "zh-CN",
                    )}
                  </div>
                )}
                {detailWallpaper.pageUrl && (
                  <div className="tw-wallpaper-detail-meta">
                    <a
                      href={detailWallpaper.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
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

  let content = null;
  if (activeNav === "general")
    content = <GeneralSection sub={sub} setSub={setSub} s={s} set={set} />;
  else if (activeNav === "search")
    content = (
      <SearchSection
        sub={sub}
        setSub={setSub}
        editingEngine={editingEngine}
        setEditingEngine={setEditingEngine}
        customEnginesRaw={workspace.preferences.customEngines}
        s={s}
        set={set}
        addCustomEngine={addCustomEngine}
        updateCustomEngine={updateCustomEngine}
        deleteCustomEngine={deleteCustomEngine}
      />
    );
  else if (activeNav === "wallpaper") content = renderWallpaper();
  else if (activeNav === "notify")
    content = (
      <NotifySection
        loggedIn={!!me}
        messages={messages}
        messagesLoading={messagesLoading}
        setMessages={setMessages}
      />
    );
  else if (activeNav === "about")
    content = <AboutSection openDoc={setDocModal} />;

  const userInitial = (me?.displayName || me?.username || "U")
    .charAt(0)
    .toUpperCase();
  const userName = me?.displayName || me?.username || "访客";

  return (
    <div className="tw-overlay" onClick={onClose}>
      <div className="tw-modal" onClick={(e) => e.stopPropagation()}>
        {/* Left nav */}
        <aside className="tw-nav">
          <div className="tw-nav-user">
            {me?.avatarUrl ? (
              <div
                className="tw-avatar"
                style={{
                  background: "transparent",
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <img
                  src={me.avatarUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              </div>
            ) : (
              <div className="tw-avatar">{userInitial}</div>
            )}
            <div className="tw-user-name">{userName}</div>
          </div>
          <nav className="tw-nav-list">
            {navItems.map((it) => (
              <button
                key={it.id}
                className={
                  "tw-nav-item" + (activeNav === it.id ? " active" : "")
                }
                onClick={() => {
                  setActiveNav(it.id);
                  setSub(null);
                }}
              >
                <span className="tw-nav-ico">{it.icon}</span>
                <span className="tw-nav-label">{it.label}</span>
              </button>
            ))}
          </nav>
          <div className="tw-nav-foot">
            <div className="tw-version" style={{ marginBottom: 4 }}>
              v{__APP_VERSION__}
            </div>
            <div className="tw-foot-links">
              <button
                type="button"
                className="tw-foot-link"
                onClick={() => setDocModal("terms")}
              >
                用户协议
              </button>
              <span>·</span>
              <button
                type="button"
                className="tw-foot-link"
                onClick={() => setDocModal("privacy")}
              >
                隐私政策
              </button>
            </div>
          </div>
        </aside>
        {/* Right content */}
        <main className="tw-main">
          <button className="tw-close" onClick={onClose} aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {content}
        </main>
      </div>

      {docModal === "terms" && (
        <DocumentModal
          title="用户协议"
          content={<TermsContent />}
          onClose={() => setDocModal(null)}
        />
      )}
      {docModal === "privacy" && (
        <DocumentModal
          title="隐私政策"
          content={<PrivacyContent />}
          onClose={() => setDocModal(null)}
        />
      )}
    </div>
  );
};
