import { useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useWallpaperShuffle } from "../hooks/useWallpaperShuffle";
import { useColorMode } from "../hooks/useColorMode";
import { Background } from "./Background";
import { Sidebar } from "./Sidebar";
import { NavView } from "./NavView";
import { TweaksPanel } from "./TweaksPanel";
import { SearchBar } from "./SearchBar";
import { UserMenu } from "./UserMenu";
import { ProfileModal } from "./ProfileModal";
import { AdminShell } from "./admin";
import { ContextMenu, CtxItem, CtxMenuState } from "./ContextMenu";
import { AddCategoryModal } from "./AddCategoryModal";
import { AddIconModal } from "./AddIconModal";
import { WidgetCatalogModal } from "./WidgetCatalogModal";
import { WidgetEditModal } from "./WidgetEditModal";
import { WidgetDetailModal } from "./WidgetDetailModal";
import { IconSearchOverlay } from "./IconSearchOverlay";
import { FolderOverlay } from "./FolderOverlay";
import { IframePreviewModal } from "./IframePreviewModal";
import { IconView, IconSize, WidgetView } from "../types";
import {
  WIDGET_REGISTRY,
  WIDGET_SIZE_DIMENSIONS,
  WIDGET_SIZE_LABEL,
  WIDGET_SIZE_ORDER,
  snapWidgetSize,
  type WidgetSizeId,
} from "../widgets";
import { confirmDialog, promptDialog } from "./Dialogs";
import { toast } from "sonner";

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
  const [dragType, setDragType] = useState<"icon" | "widget" | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
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

  if (adminOpen) {
    return <AdminShell onClose={() => { setAdminOpen(false); setAdminInitialTab(undefined); }} initialTab={adminInitialTab} />;
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
        toast.success("已切换到新壁纸");
      } else {
        await updateTweaks({ wallpaperShuffle: true, backgroundMode: undefined });
        toast.success("已开启随机壁纸轮换");
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
    if (ic.url && ic.url !== "#") window.open(ic.url, "_blank");
  };

  const blankCtx = (e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    if (isGuest) {
      openCtx(x, y, [
        { icon: "sparkle", label: "随机壁纸", onClick: randomWallpaper },
        { icon: "search", label: "搜索图标", shortcut: "⌘+F", onClick: () => setIconSearchOpen(true) },
      ]);
      return;
    }
    const editable = canEditGroup(activeGroup);
    const g = workspace.groups.find((x) => x.id === activeGroup);
    const items: CtxItem[] = [];
    if (editable) {
      items.push({
        icon: "plus",
        label: "添加图标",
        onClick: () => setAddIconOpen(true),
      });
      items.push({
        icon: "grid",
        label: "添加小组件...",
        onClick: () => setCatalogOpen(true),
      });
    }
    items.push({ icon: "sparkle", label: "随机壁纸", onClick: randomWallpaper });
    if (editable) items.push({ icon: "edit", label: "编辑主页", onClick: () => setTweaksOpen(true) });
    items.push({ divider: true });
    items.push({
      icon: "search",
      label: "搜索图标",
      shortcut: "⌘+F",
      onClick: () => setIconSearchOpen(true),
    });
    openCtx(x, y, items);
  };

  const widgetSizeToConfig = (sz: WidgetSizeId) => WIDGET_SIZE_DIMENSIONS[sz];
  const widgetConfigToSize = (span?: number | null, row?: number | null): WidgetSizeId =>
    snapWidgetSize(span, row);
  const WIDGET_SIZE_OPTIONS = WIDGET_SIZE_ORDER.map((id) => ({ id, label: WIDGET_SIZE_LABEL[id] }));

  const tileCtx = (e: React.MouseEvent, item: IconView | WidgetView) => {
    const x = e.clientX;
    const y = e.clientY;
    if (isGuest) {
      if ("widget" in item) {
        // null
      } else {
        openCtx(x, y, [
          { icon: "external", label: "打开", onClick: () => openIcon(item as IconView) },
        ]);
      }
      return;
    }
    const editable = canEditGroup(item.groupId);
    if ("widget" in item) {
      const w = item as WidgetView;
      const items: CtxItem[] = [];
      if (editable) {
        if (WIDGET_REGISTRY[w.widget]?.editable) {
          items.push({
            icon: "settings",
            label: "编辑",
            onClick: () => setEditingWidgetId(w.id),
          });
          items.push({ divider: true });
        }
        items.push({
          kind: "size",
          current: widgetConfigToSize(w.wSpan, w.wRow),
          sizes: WIDGET_SIZE_OPTIONS,
          onPick: (sz) =>
            void updateWidget(w.id, widgetSizeToConfig(sz as WidgetSizeId)),
        });
        items.push({ divider: true });
        items.push({
          icon: "trash",
          label: "删除组件",
          danger: true,
          onClick: () => void deleteWidget(w.id),
        });
      }
      if (items.length > 0) openCtx(x, y, items);
      return;
    }
    const ic = item as IconView;
    if (ic.isFolder) {
      if (!editable) {
        return;
      }
      openCtx(x, y, [
        {
          label: "小",
          onClick: () => void updateIcon(ic.id, { size: "sq" }),
        },
        {
          label: "四宫格",
          onClick: () => void updateIcon(ic.id, { size: "lg-4" }),
        },
        {
          label: "九宫格",
          onClick: () => void updateIcon(ic.id, { size: "lg-9" }),
        },
        { divider: true },
        {
          label: "删除",
          danger: true,
          onClick: async () => {
            if (await confirmDialog(`删除文件夹"${ic.name}"?`)) void deleteIcon(ic.id);
          },
        },
      ]);
      return;
    }
    const items: CtxItem[] = [
      { icon: "arrow-right", label: "当前页面打开", onClick: () => { if (ic.url && ic.url !== "#") window.location.href = ic.url; } },
      { icon: "external", label: "新标签页打开", onClick: () => openIcon(ic) },
    ];
    if (editable) {
      items.push({
        icon: "edit",
        label: "编辑图标",
        onClick: () => setAddIconOpen(ic),
      });
      items.push({
        icon: "trash",
        label: "删除图标",
        danger: true,
        onClick: async () => {
          if (await confirmDialog(`删除"${ic.name}"?`)) void deleteIcon(ic.id);
        },
      });
    }
    if (items.length > 0) openCtx(x, y, items);
  };

  const groupCtx = (e: React.MouseEvent, groupId: string) => {
    if (isGuest) return;
    const g = workspace.groups.find((x) => x.id === groupId);
    if (!g) return;
    const editable = canEditGroup(groupId);
    const items: CtxItem[] = [];
    if (editable) {
      items.push({
        icon: "edit",
        label: "重命名",
        onClick: async () => {
          const next = await promptDialog("分组名称", g.name, "重命名前");
          if (next && next.trim() && next !== g.name)
            void updateGroup(groupId, { name: next.trim() });
        },
      });
      items.push({ divider: true });
      items.push({
        icon: "trash",
        label: "删除分组",
        danger: true,
        onClick: async () => {
          if (await confirmDialog(`删除"${g.name}"及其所有图标/组件?`)) void deleteGroup(groupId);
        },
      });
    }
    if (items.length > 0) openCtx(e.clientX, e.clientY, items);
  };

  const sideCtx = (e: React.MouseEvent) => {
    const items: CtxItem[] = [];
    if (!isGuest) {
      items.push({ icon: "plus", label: "新建分组", onClick: () => setAddCatOpen(true) });
      items.push({ divider: true });
    }
    items.push({
      icon: sidebarMode === "pinned" ? "check" : "blank",
      label: "长期驻留",
      onClick: () => void updateTweaks({ sidebar: "pinned" }),
    });
    items.push({
      icon: sidebarMode === "autohide" ? "check" : "blank",
      label: "自动隐藏",
      onClick: () => void updateTweaks({ sidebar: "autohide" }),
    });
    items.push({
      icon: sidebarMode === "hidden" ? "check" : "blank",
      label: "一直隐藏",
      onClick: () => void updateTweaks({ sidebar: "hidden" }),
    });
    openCtx(e.clientX, e.clientY, items);
  };

  return (
    <>
      <Background
        theme={theme}
        wallpaperUrl={wallpaperUrl}
        wallpaperMediaType={wallpaperMediaType}
        wallpaperPosterUrl={wallpaperPosterUrl}
        showWallpaper={!!wallpaperUrl}
      />

      <div
        className={`app sb-${sidebarMode} sbpos-${tweaks.sidebarPos || "left"} bgmode-${sidebarBgMode}`}
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
        <Sidebar
          groups={workspace.groups}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
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
        />

        <main className="main">
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
            onReorderGroupItems={reorderGroupItems}
            onMergeIcon={mergeIcon}
            onMoveGroupItem={async (itemType, itemId, targetGroupId, targetIndex) => {
              if (itemType === "icon") {
                await updateIcon(itemId, { groupId: targetGroupId });
              } else if (itemType === "widget") {
                await updateWidget(itemId, { groupId: targetGroupId });
              }
              
              const currentWidgets = workspace.widgets.filter(w => w.groupId === targetGroupId && w.id !== itemId);
              const currentIcons = workspace.icons.filter(i => i.groupId === targetGroupId && i.id !== itemId);
              const combinedItems = [
                ...currentWidgets.map(w => ({ type: 'widget' as const, id: w.id, sortOrder: w.sortOrder, gridX: w.gridX, gridY: w.gridY })),
                ...currentIcons.map(i => ({ type: 'icon' as const, id: i.id, sortOrder: i.sortOrder, gridX: i.gridX, gridY: i.gridY })),
              ].sort((a, b) => a.sortOrder - b.sortOrder);
              
              combinedItems.splice(targetIndex, 0, { type: itemType as any, id: itemId, sortOrder: 0, gridX: null, gridY: null });
              
              reorderGroupItems(targetGroupId, combinedItems.map(x => ({ id: x.id, type: x.type, x: x.gridX, y: x.gridY })));
            }}
            onExpandWidget={(w) => setDetailWidgetId(w.id)}
            onExtractFolderItem={extractFolderItem}
          />
        </main>
      </div>

      {catalogOpen && (
        <WidgetCatalogModal
          groups={workspace.groups}
          defaultGroupId={activeGroup}
          onClose={() => setCatalogOpen(false)}
          onAdd={(groupId, widgetId, span) => {
            void addWidget(groupId, widgetId, span);
            setCatalogOpen(false);
          }}
        />
      )}

      {openedFolder && (
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
          onItemContext={(e, item) => {
            const x = e.clientX;
            const y = e.clientY;
            const editable = canEditGroup(openedFolder.groupId);
            const items: CtxItem[] = [];
            if (item.url && item.url !== "#") {
              items.push({ icon: "arrow-right", label: "当前页面打开", onClick: () => { window.location.href = item.url!; } });
              items.push({ icon: "external", label: "新标签页打开", onClick: () => { window.open(item.url!, "_blank"); } });
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
                  if (await confirmDialog(`删除"${item.name}"?`)) void deleteIcon(item.id);
                },
              });
              items.push({ divider: true });
              items.push({ icon: "move", label: "从文件夹取出", onClick: () => { extractFolderItem(openedFolder.id, item.id); } });
            }
            if (items.length > 0) openCtx(x, y, items);
          }}
        />
      )}

      {editingWidget && (
        <WidgetEditModal
          widget={editingWidget}
          onClose={() => setEditingWidgetId(null)}
        />
      )}

      {detailWidget && (
        <WidgetDetailModal
          widget={detailWidget}
          onClose={() => setDetailWidgetId(null)}
        />
      )}

      {tweaksOpen && <TweaksPanel onClose={() => setTweaksOpen(false)} />}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

      {iconSearchOpen && (
        <IconSearchOverlay
          icons={workspace.icons}
          groups={workspace.groups}
          onClose={() => setIconSearchOpen(false)}
          onOpenIcon={openIcon}
          onActivateGroup={setActiveGroup}
        />
      )}

      {iframePreviewIcon && (
        <IframePreviewModal
          icon={iframePreviewIcon}
          onClose={() => setIframePreviewIcon(null)}
        />
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
        <AddCategoryModal
          onClose={() => setAddCatOpen(false)}
          onSave={async ({ name, icon }) => {
            setAddCatOpen(false);
            await addGroup(name, icon);
          }}
        />
      )}

      {addIconOpen && (
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
      )}
    </>
  );
};
