import { useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { DocumentModal, TermsContent, PrivacyContent } from "./DocumentModal";
import { api } from "../api";
import type {
  UserMessage,
  CustomEngine,
  RemoteWallpaperItem,
  PublicWallpaperSource,
} from "../types";
import { navItems } from "./tweaks/constants";
import { GeneralSection } from "./tweaks/GeneralSection";
import { WallpaperSection } from "./tweaks/WallpaperSection";
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
  else if (activeNav === "wallpaper")
    content = (
      <WallpaperSection
        sub={sub}
        setSub={setSub}
        s={s}
        set={set}
        updateTweaks={updateTweaks}
        remoteWallpapers={remoteWallpapers}
        remoteWallpaperTotal={remoteWallpaperTotal}
        remoteWallpapersLoading={remoteWallpapersLoading}
        wallpaperSearch={wallpaperSearch}
        setWallpaperSearch={setWallpaperSearch}
        wallpaperMediaFilter={wallpaperMediaFilter}
        setWallpaperMediaFilter={setWallpaperMediaFilter}
        wallpaperSourceFilter={wallpaperSourceFilter}
        setWallpaperSourceFilter={setWallpaperSourceFilter}
        wallpaperSources={wallpaperSources}
        wallpaperPage={wallpaperPage}
        setWallpaperPage={setWallpaperPage}
        detailWallpaper={detailWallpaper}
        setDetailWallpaper={setDetailWallpaper}
      />
    );
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
