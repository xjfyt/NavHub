import { lazy, Suspense, useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useWallpaperShuffle } from "../hooks/useWallpaperShuffle";
import { useColorMode } from "../hooks/useColorMode";
import { DndContext } from "@dnd-kit/core";
import { Background } from "./Background";
import { Sidebar } from "./Sidebar";
import { NavView } from "./NavView";
import { useNavDnd } from "../hooks/useNavDnd";
import { UserMenu } from "./UserMenu";
import { ContextMenu, CtxItem, CtxMenuState } from "./ContextMenu";
import { Icon } from "./Icon";
import { GroupView, IconView, WidgetView } from "../types";
import { WIDGET_REGISTRY } from "../widgets";
import { safeHttpUrl } from "../utils/iconSources";
import { confirmDialog } from "./Dialogs";
import { toast } from "sonner";
import {
  buildBlankCtx,
  buildGroupCtx,
  buildSideCtx,
  buildTileCtx,
  type ShellMenuCtx,
} from "./Shell.menus";

// Heavy / rarely-used surfaces are split out so they don't block first paint.
// Each one is only fetched when the user actually opens it.
const TweaksPanel = lazy(() =>
  import("./TweaksPanel").then((m) => ({ default: m.TweaksPanel })),
);
const ProfileModal = lazy(() =>
  import("./ProfileModal").then((m) => ({ default: m.ProfileModal })),
);
const AdminShell = lazy(() =>
  import("./admin").then((m) => ({ default: m.AdminShell })),
);
const AddCategoryModal = lazy(() =>
  import("./AddCategoryModal").then((m) => ({ default: m.AddCategoryModal })),
);
const AddIconModal = lazy(() =>
  import("./AddIconModal").then((m) => ({ default: m.AddIconModal })),
);
const WidgetCatalogModal = lazy(() =>
  import("./WidgetCatalogModal").then((m) => ({ default: m.WidgetCatalogModal })),
);
const WidgetEditModal = lazy(() =>
  import("./WidgetEditModal").then((m) => ({ default: m.WidgetEditModal })),
);
const WidgetDetailModal = lazy(() =>
  import("./WidgetDetailModal").then((m) => ({ default: m.WidgetDetailModal })),
);
const IconSearchOverlay = lazy(() =>
  import("./IconSearchOverlay").then((m) => ({ default: m.IconSearchOverlay })),
);
const FolderOverlay = lazy(() =>
  import("./FolderOverlay").then((m) => ({ default: m.FolderOverlay })),
);
const IframePreviewModal = lazy(() =>
  import("./IframePreviewModal").then((m) => ({ default: m.IframePreviewModal })),
);

// Modals open over the existing UI; returning null while their chunk loads
// is preferable to a flashing spinner.
const ModalSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

export const Shell = ({
  onLogout,
  onRequestLogin,
}: {
  onLogout: () => void | Promise<void>;
  onRequestLogin: () => void;
}) => {
  const {
    me,
    isGuest,
    workspace,
    activeGroup,
    setActiveGroup,
    reorderGroup,
    reorderGroupItems,
    mergeIcon,
    extractFolderItem,
    reorderFolderItems,
    updateIcon,
    deleteIcon,
    updateWidget,
    deleteWidget,
    addWidget,
    addIcon,
    updateGroup,
    deleteGroup,
    addGroup,
    updateTweaks,
    canEditGroup,
  } = useWorkspace();
  const tweaks = workspace.preferences.tweaks || {};

  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<string | undefined>();
  const [profileOpen, setProfileOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [addCatOpen, setAddCatOpen] = useState<boolean | GroupView>(false);
  const [addIconOpen, setAddIconOpen] = useState<boolean | IconView>(false);
  const [iconSearchOpen, setIconSearchOpen] = useState(false);
  const [iframePreviewIcon, setIframePreviewIcon] = useState<IconView | null>(null);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const editingWidget = editingWidgetId
    ? workspace.widgets.find((w) => w.id === editingWidgetId) ?? null
    : null;
  const [detailWidgetId, setDetailWidgetId] = useState<string | null>(null);
  const detailWidget = detailWidgetId
    ? workspace.widgets.find((w) => w.id === detailWidgetId) ?? null
    : null;
  const [isChangingWallpaper, setIsChangingWallpaper] = useState(false);
  // 窄屏(≤768px)下侧边栏收起为抽屉,由汉堡按钮开合。桌面端该状态不影响布局。
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { shufflePreset, shuffleEnabled, shuffleActive, nextPreset } =
    useWallpaperShuffle(tweaks);
  useColorMode(tweaks.mode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      setIconSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const theme = tweaks.theme || "dawn";
  const wallpaperUrl = shuffleActive
    ? shufflePreset!.assetUrl
    : tweaks.backgroundMode === "wallpaper"
      ? (tweaks.wallpaperUrl as string | undefined)
      : undefined;
  const wallpaperMediaType = shuffleActive
    ? shufflePreset!.mediaType
    : tweaks.backgroundMode === "wallpaper"
      ? (tweaks.wallpaperMediaType as "image" | "video" | undefined)
      : undefined;
  const wallpaperPosterUrl = shuffleActive
    ? (shufflePreset!.posterUrl || shufflePreset!.thumbUrl)
    : tweaks.backgroundMode === "wallpaper"
      ? (tweaks.wallpaperPosterUrl as string | undefined)
      : undefined;
  const sidebarMode = (tweaks.sidebar as "pinned" | "autohide" | "hidden") || "pinned";
  const sidebarWidth = Math.max(48, Math.min(84, Number(tweaks.sidebarWidth) || 56));
  const sidebarGap = Math.max(2, Math.min(18, Number(tweaks.sidebarGap) || 6));
  const sidebarBgMode = wallpaperUrl ? "wallpaper" : "theme";

  // Moved openedFolder state up to prevent hook mismatch when adminOpen is true
  const [openedFolder, setOpenedFolder] = useState<IconView | null>(null);

  // UX-27: 跨分类移动元素到目标分类顶部，并把目标分类其余元素的 sortOrder 重排。
  // 抽成具名函数交给 useNavDnd —— 它在松手命中分类 droppable 时调用本函数。
  const moveGroupItemToTop = async (
    itemType: "icon" | "widget",
    itemId: string,
    targetGroupId: string,
  ) => {
    if (itemType === "icon") {
      await updateIcon(itemId, { groupId: targetGroupId });
    } else if (itemType === "widget") {
      await updateWidget(itemId, { groupId: targetGroupId });
    }
    const tWidgets = workspace.widgets.filter((w) => w.groupId === targetGroupId && w.id !== itemId);
    const tIcons = workspace.icons.filter((i) => i.groupId === targetGroupId && i.id !== itemId);
    const combined = [
      ...tWidgets.map((w) => ({ type: "widget" as const, id: w.id, sortOrder: w.sortOrder, gridX: w.gridX, gridY: w.gridY })),
      ...tIcons.map((i) => ({ type: "icon" as const, id: i.id, sortOrder: i.sortOrder, gridX: i.gridX, gridY: i.gridY })),
    ].sort((a, b) => a.sortOrder - b.sortOrder);
    combined.unshift({ type: itemType, id: itemId, sortOrder: 0, gridX: null, gridY: null });
    reorderGroupItems(targetGroupId, combined.map((x) => ({ id: x.id, type: x.type, x: x.gridX, y: x.gridY })));
  };

  // 统一的拖拽协调(分类内排序 / 文件夹合并 / 跨分类移动)——与侧边栏共处同一 <DndContext>。
  const navDnd = useNavDnd({
    activeGroup,
    icons: workspace.icons,
    widgets: workspace.widgets,
    onReorderGroupItems: reorderGroupItems,
    onMergeIcon: mergeIcon,
    onMoveGroupItem: async (itemType, itemId, targetGroupId) => {
      // 落地后切到目标分类(与原行为一致：图标移动后视图跟到目标分类)。
      setActiveGroup(targetGroupId);
      await moveGroupItemToTop(itemType, itemId, targetGroupId);
    },
    groupName: (gid) => workspace.groups.find((g) => g.id === gid)?.name,
  });

  if (adminOpen) {
    // Admin shell is the largest split chunk; show a minimal full-screen
    // placeholder while it loads instead of a layout flash.
    return (
      <Suspense
        fallback={
          <div className="nh-boot">
            <div className="nh-boot-spinner" />
            <div className="nh-boot-text">正在加载管理后台 …</div>
          </div>
        }
      >
        <AdminShell
          onClose={() => {
            setAdminOpen(false);
            setAdminInitialTab(undefined);
          }}
          initialTab={adminInitialTab}
        />
      </Suspense>
    );
  }

  const onAvatarClick = () => {
    if (isGuest) onRequestLogin();
    else setUserMenuOpen(true);
  };

  const openCtx = (x: number, y: number, items: CtxItem[]) =>
    setCtxMenu({ x, y, items });

  const randomWallpaper = async () => {
    if (isChangingWallpaper) return;
    setIsChangingWallpaper(true);
    try {
      if (shuffleEnabled) {
        nextPreset();
        toast.success("已切换到新壁纸", { id: "wallpaper-switch" });
      } else {
        await updateTweaks({ wallpaperShuffle: true, backgroundMode: undefined });
        toast.success("已开启随机壁纸轮换", { id: "wallpaper-switch" });
      }
    } finally {
      setIsChangingWallpaper(false);
    }
  };

  const openIcon = (ic: IconView) => {
    if (ic.isFolder) {
      setOpenedFolder(ic);
      return;
    }
    if (ic.iframePreview && ic.url && ic.url !== "#") {
      setIframePreviewIcon(ic);
      return;
    }
    { const safe = safeHttpUrl(ic.url); if (safe) window.open(safe, "_blank", "noopener,noreferrer"); }
  };

  // Context-menu builders live in Shell.menus.tsx; this bag is the only thing
  // they need from Shell. Keeping the dep list explicit here makes it obvious
  // when a menu starts depending on new state.
  const menuCtx: ShellMenuCtx = {
    isGuest,
    activeGroup,
    groups: workspace.groups,
    sidebarMode,
    canEditGroup,
    openCtx,
    openIcon,
    randomWallpaper,
    setAddIconOpen,
    setCatalogOpen,
    setTweaksOpen,
    setIconSearchOpen,
    setEditingWidgetId,
    setAddCatOpen,
    updateIcon,
    deleteIcon,
    updateWidget,
    deleteWidget,
    updateGroup,
    deleteGroup,
    updateTweaks,
  };
  const blankCtx = (e: React.MouseEvent) => buildBlankCtx(menuCtx, e);
  const tileCtx = (e: React.MouseEvent, item: IconView | WidgetView) =>
    buildTileCtx(menuCtx, e, item);
  const groupCtx = (e: React.MouseEvent, groupId: string) =>
    buildGroupCtx(menuCtx, e, groupId);
  const sideCtx = (e: React.MouseEvent) => buildSideCtx(menuCtx, e);

  return (
    <>
      <Background
        theme={theme}
        wallpaperUrl={wallpaperUrl}
        wallpaperMediaType={wallpaperMediaType}
        wallpaperPosterUrl={wallpaperPosterUrl}
        showWallpaper={!!wallpaperUrl}
      />

      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={mobileNavOpen ? "关闭菜单" : "打开菜单"}
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((v) => !v)}
      >
        {mobileNavOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      <div
        className={`app sb-${sidebarMode} sbpos-${tweaks.sidebarPos || "left"} bgmode-${sidebarBgMode}${tweaks.hideIconName ? " hide-icon-name" : ""}${mobileNavOpen ? " mobile-nav-open" : ""}`}
        style={{
          fontFamily: tweaks.useSystemFont ? "system-ui" : "var(--font-main)",
          ["--sidebar-width" as string]: `${sidebarWidth}px`,
          ["--sidebar-gap" as string]: `${sidebarGap}px`,
        }}
        onContextMenu={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("input, textarea, [contenteditable='true']")) return;
          e.preventDefault();
          blankCtx(e);
        }}
      >
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        {/* UX-27: 单一 <DndContext> 同时覆盖侧边栏与网格 —— 分类内排序、文件夹合并、
            跨分类移动都在此完成。侧边栏分类按钮是真正的 @dnd-kit droppable。 */}
        <DndContext
          sensors={navDnd.sensors}
          collisionDetection={navDnd.collisionDetection}
          onDragStart={navDnd.onDragStart}
          onDragMove={navDnd.onDragMove}
          onDragEnd={navDnd.onDragEnd}
          onDragCancel={navDnd.onDragCancel}
        >
          <Sidebar
            groups={workspace.groups}
            activeGroup={activeGroup}
            setActiveGroup={(id) => {
              setActiveGroup(id);
              // 窄屏抽屉态下,选中分类后顺手收起抽屉,回到内容区。
              setMobileNavOpen(false);
            }}
            user={me}
            onAvatar={onAvatarClick}
            sidebarMode={sidebarMode}
            onContext={groupCtx}
            onSideContext={sideCtx}
            onAddCategory={() => setAddCatOpen(true)}
            onReorderGroup={reorderGroup}
            onDropItemToGroup={(itemType, itemId, groupId) => {
              if (itemType === "icon") {
                updateIcon(itemId, { groupId });
              } else if (itemType === "widget") {
                updateWidget(itemId, { groupId });
              }
              setActiveGroup(groupId);
            }}
            dndActiveItemId={navDnd.activeId}
          />

          <main className="main">
            {isGuest && (
              <div className="guest-banner" role="status">
                <Icon name="key" size={16} />
                <span className="guest-banner-text">
                  你正在以访客身份浏览，登录后可保存图标、组件与个性化设置。
                </span>
                <button
                  type="button"
                  className="guest-banner-btn"
                  onClick={onRequestLogin}
                >
                  登录
                </button>
              </div>
            )}
            <NavView
              activeGroup={activeGroup}
              groups={workspace.groups}
              icons={workspace.icons}
              widgets={workspace.widgets}
              tweaks={{ ...tweaks, hideAddIcon: tweaks.hideAddIcon || isGuest || !canEditGroup(activeGroup) }}
              setActiveGroup={setActiveGroup}
              onOpenIcon={(_e, ic) => openIcon(ic)}
              onCtxTile={tileCtx}
              onAddClick={(e) => {
                if (isGuest || !canEditGroup(activeGroup)) return;
                const x = e.clientX;
                const y = e.clientY;
                openCtx(x, y, [
                  {
                    icon: "grid",
                    label: "添加小组件...",
                    onClick: () => setCatalogOpen(true),
                  },
                  {
                    icon: "plus",
                    label: "添加图标",
                    onClick: () => setAddIconOpen(true),
                  },
                ]);
              }}
              onExpandWidget={(w) => setDetailWidgetId(w.id)}
              onExtractFolderItem={extractFolderItem}
              editable={!isGuest && canEditGroup(activeGroup)}
              onAddCategory={() => setAddCatOpen(true)}
              onAddIcon={() => setAddIconOpen(true)}
              dnd={navDnd}
            />
          </main>
        </DndContext>
      </div>

      {catalogOpen && (
        <ModalSuspense>
          <WidgetCatalogModal
            groups={workspace.groups}
            defaultGroupId={activeGroup}
            onClose={() => setCatalogOpen(false)}
            onAdd={(groupId, widgetId, span) => {
              void addWidget(groupId, widgetId, span);
              setCatalogOpen(false);
            }}
          />
        </ModalSuspense>
      )}

      {openedFolder && (
        <ModalSuspense>
          <FolderOverlay
            folder={openedFolder}
            onClose={() => setOpenedFolder(null)}
            onExtract={(itemId) => {
              extractFolderItem(openedFolder.id, itemId);
            }}
            onRename={canEditGroup(openedFolder.groupId) ? (newName) => {
              if (newName.trim() && newName.trim() !== openedFolder.name) {
                updateIcon(openedFolder.id, { name: newName.trim() });
                setOpenedFolder({ ...openedFolder, name: newName.trim() });
              }
            } : undefined}
            onReorder={canEditGroup(openedFolder.groupId) ? (order) => {
              void reorderFolderItems(openedFolder.id, order);
            } : undefined}
            onItemContext={(e, item) => {
              const x = e.clientX;
              const y = e.clientY;
              const editable = canEditGroup(openedFolder.groupId);
              const items: CtxItem[] = [];
              if (item.url && item.url !== "#") {
                items.push({ icon: "arrow-right", label: "当前页面打开", onClick: () => { const safe = safeHttpUrl(item.url); if (safe) window.location.href = safe; } });
                items.push({ icon: "external", label: "新标签页打开", onClick: () => { const safe = safeHttpUrl(item.url); if (safe) window.open(safe, "_blank", "noopener,noreferrer"); } });
              }
              if (editable) {
                if (items.length > 0) items.push({ divider: true });
                items.push({
                  icon: "edit",
                  label: "编辑图标",
                  onClick: () => {
                    setOpenedFolder(null); // Close the folder overlay when editing
                    setAddIconOpen(item as IconView);
                  }
                });
                items.push({
                  icon: "trash",
                  label: "删除图标",
                  danger: true,
                  onClick: async () => {
                    if (await confirmDialog(`删除"${item.name}"?`, undefined, { danger: true })) void deleteIcon(item.id);
                  },
                });
                items.push({ divider: true });
                items.push({ icon: "move", label: "从文件夹取出", onClick: () => { extractFolderItem(openedFolder.id, item.id); } });
              }
              if (items.length > 0) openCtx(x, y, items);
            }}
          />
        </ModalSuspense>
      )}

      {editingWidget && (
        <ModalSuspense>
          <WidgetEditModal
            widget={editingWidget}
            onClose={() => setEditingWidgetId(null)}
          />
        </ModalSuspense>
      )}

      {detailWidget && (
        <ModalSuspense>
          <WidgetDetailModal
            widget={detailWidget}
            onClose={() => setDetailWidgetId(null)}
            onEdit={
              !isGuest &&
              canEditGroup(detailWidget.groupId) &&
              WIDGET_REGISTRY[detailWidget.widget]?.editable
                ? () => {
                    // UX-22:从详情直达编辑 —— 关闭详情、打开该组件的编辑弹窗。
                    setDetailWidgetId(null);
                    setEditingWidgetId(detailWidget.id);
                  }
                : undefined
            }
          />
        </ModalSuspense>
      )}

      {tweaksOpen && (
        <ModalSuspense>
          <TweaksPanel onClose={() => setTweaksOpen(false)} />
        </ModalSuspense>
      )}

      {profileOpen && (
        <ModalSuspense>
          <ProfileModal onClose={() => setProfileOpen(false)} />
        </ModalSuspense>
      )}

      {iconSearchOpen && (
        <ModalSuspense>
          <IconSearchOverlay
            icons={workspace.icons}
            groups={workspace.groups}
            onClose={() => setIconSearchOpen(false)}
            onOpenIcon={openIcon}
            onActivateGroup={setActiveGroup}
          />
        </ModalSuspense>
      )}

      {iframePreviewIcon && (
        <ModalSuspense>
          <IframePreviewModal
            icon={iframePreviewIcon}
            onClose={() => setIframePreviewIcon(null)}
          />
        </ModalSuspense>
      )}

      {userMenuOpen && me && (
        <UserMenu
          user={me}
          onClose={() => setUserMenuOpen(false)}
          onContextMenu={blankCtx}
          onOpenAdmin={() => { setUserMenuOpen(false); setAdminInitialTab(undefined); setAdminOpen(true); }}
          onOpenSSO={() => { setUserMenuOpen(false); setAdminInitialTab("sso"); setAdminOpen(true); }}
          onOpenSettings={(isProfile) => {
            setUserMenuOpen(false);
            if (isProfile) setProfileOpen(true);
            else setTweaksOpen(true);
          }}
          onLogout={() => void onLogout()}
          sidebarPos={tweaks.sidebarPos === "right" ? "right" : "left"}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {addCatOpen && (
        <ModalSuspense>
          <AddCategoryModal
            initial={typeof addCatOpen === "object" ? addCatOpen : undefined}
            onClose={() => setAddCatOpen(false)}
            onSave={async ({ name, icon }) => {
              const editing = typeof addCatOpen === "object" ? addCatOpen : null;
              setAddCatOpen(false);
              if (editing) {
                await updateGroup(editing.id, { name, icon });
              } else {
                await addGroup(name, icon);
              }
            }}
          />
        </ModalSuspense>
      )}

      {addIconOpen && (
        <ModalSuspense>
          <AddIconModal
            groups={workspace.groups}
            defaultGroupId={activeGroup}
            onClose={() => setAddIconOpen(false)}
            initialIcon={typeof addIconOpen === "object" ? addIconOpen : undefined}
            onSave={async (body) => {
              setAddIconOpen(false);
              if (typeof addIconOpen === "object" && addIconOpen.id) {
                await updateIcon(addIconOpen.id, body);
              } else {
                const created = await addIcon(body);
                if (created) setActiveGroup(created.groupId);
              }
            }}
          />
        </ModalSuspense>
      )}
    </>
  );
};
