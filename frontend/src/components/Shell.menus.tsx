import type { CtxItem } from "./ContextMenu";
import { confirmDialog, promptDialog } from "./Dialogs";
import type { GroupView, IconView, WidgetView } from "../types";
import {
  WIDGET_REGISTRY,
  WIDGET_SIZE_DIMENSIONS,
  WIDGET_SIZE_LABEL,
  WIDGET_SIZE_ORDER,
  snapWidgetSize,
  type WidgetSizeId,
} from "../widgets";

/**
 * Everything the four context-menu builders need from Shell. Aggregating these
 * into a single typed bag means callers don't need a 20-argument function and
 * lets the menu logic live in its own file without React hooks gymnastics.
 */
export interface ShellMenuCtx {
  isGuest: boolean;
  activeGroup: string;
  groups: GroupView[];
  sidebarMode: "pinned" | "autohide" | "hidden";

  canEditGroup: (id: string) => boolean;
  openCtx: (x: number, y: number, items: CtxItem[]) => void;
  openIcon: (ic: IconView) => void;
  randomWallpaper: () => void;

  setAddIconOpen: (v: boolean | IconView) => void;
  setCatalogOpen: (v: boolean) => void;
  setTweaksOpen: (v: boolean) => void;
  setIconSearchOpen: (v: boolean) => void;
  setEditingWidgetId: (id: string | null) => void;
  setAddCatOpen: (v: boolean) => void;

  updateIcon: (id: string, patch: Partial<IconView>) => void;
  deleteIcon: (id: string) => void;
  updateWidget: (id: string, patch: Partial<WidgetView>) => void;
  deleteWidget: (id: string) => void;
  updateGroup: (id: string, patch: Partial<GroupView>) => void;
  deleteGroup: (id: string) => void;
  updateTweaks: (t: any) => void;
}

const widgetSizeToConfig = (sz: WidgetSizeId) => WIDGET_SIZE_DIMENSIONS[sz];
const widgetConfigToSize = (span?: number | null, row?: number | null): WidgetSizeId =>
  snapWidgetSize(span, row);
const WIDGET_SIZE_OPTIONS = WIDGET_SIZE_ORDER.map((id) => ({ id, label: WIDGET_SIZE_LABEL[id] }));

/** Right-click on empty workspace area. */
export function buildBlankCtx(ctx: ShellMenuCtx, e: React.MouseEvent) {
  const x = e.clientX;
  const y = e.clientY;
  if (ctx.isGuest) {
    ctx.openCtx(x, y, [
      { icon: "sparkle", label: "随机壁纸", onClick: ctx.randomWallpaper },
      { icon: "search", label: "搜索图标", shortcut: "⌘+F", onClick: () => ctx.setIconSearchOpen(true) },
    ]);
    return;
  }
  const editable = ctx.canEditGroup(ctx.activeGroup);
  const items: CtxItem[] = [];
  if (editable) {
    items.push({ icon: "plus", label: "添加图标", onClick: () => ctx.setAddIconOpen(true) });
    items.push({ icon: "grid", label: "添加小组件...", onClick: () => ctx.setCatalogOpen(true) });
  }
  items.push({ icon: "sparkle", label: "随机壁纸", onClick: ctx.randomWallpaper });
  if (editable) items.push({ icon: "edit", label: "编辑主页", onClick: () => ctx.setTweaksOpen(true) });
  items.push({ divider: true });
  items.push({
    icon: "search",
    label: "搜索图标",
    shortcut: "⌘+F",
    onClick: () => ctx.setIconSearchOpen(true),
  });
  ctx.openCtx(x, y, items);
}

/** Right-click on a tile (icon or widget). */
export function buildTileCtx(ctx: ShellMenuCtx, e: React.MouseEvent, item: IconView | WidgetView) {
  const x = e.clientX;
  const y = e.clientY;
  if (ctx.isGuest) {
    if (!("widget" in item)) {
      ctx.openCtx(x, y, [
        { icon: "external", label: "打开", onClick: () => ctx.openIcon(item as IconView) },
      ]);
    }
    return;
  }
  const editable = ctx.canEditGroup(item.groupId);
  if ("widget" in item) {
    const w = item as WidgetView;
    const items: CtxItem[] = [];
    if (editable) {
      if (WIDGET_REGISTRY[w.widget]?.editable) {
        items.push({ icon: "settings", label: "编辑", onClick: () => ctx.setEditingWidgetId(w.id) });
        items.push({ divider: true });
      }
      items.push({
        kind: "size",
        current: widgetConfigToSize(w.wSpan, w.wRow),
        sizes: WIDGET_SIZE_OPTIONS,
        onPick: (sz) => void ctx.updateWidget(w.id, widgetSizeToConfig(sz as WidgetSizeId)),
      });
      items.push({ divider: true });
      items.push({
        icon: "trash",
        label: "删除组件",
        danger: true,
        onClick: () => void ctx.deleteWidget(w.id),
      });
    }
    if (items.length > 0) ctx.openCtx(x, y, items);
    return;
  }
  const ic = item as IconView;
  if (ic.isFolder) {
    if (!editable) return;
    ctx.openCtx(x, y, [
      { icon: "square", label: "小", onClick: () => void ctx.updateIcon(ic.id, { size: "sq" }) },
      { icon: "grid", label: "四宫格", onClick: () => void ctx.updateIcon(ic.id, { size: "lg-4" }) },
      { icon: "grid-3x3", label: "九宫格", onClick: () => void ctx.updateIcon(ic.id, { size: "lg-9" }) },
      { divider: true },
      {
        icon: "trash",
        label: "删除",
        danger: true,
        onClick: async () => {
          if (await confirmDialog(`删除文件夹"${ic.name}"?`)) void ctx.deleteIcon(ic.id);
        },
      },
    ]);
    return;
  }
  const items: CtxItem[] = [
    {
      icon: "arrow-right",
      label: "当前页面打开",
      onClick: () => {
        if (ic.url && ic.url !== "#") window.location.href = ic.url;
      },
    },
    { icon: "external", label: "新标签页打开", onClick: () => ctx.openIcon(ic) },
  ];
  if (editable) {
    items.push({ icon: "edit", label: "编辑图标", onClick: () => ctx.setAddIconOpen(ic) });
    items.push({
      icon: "trash",
      label: "删除图标",
      danger: true,
      onClick: async () => {
        if (await confirmDialog(`删除"${ic.name}"?`)) void ctx.deleteIcon(ic.id);
      },
    });
  }
  if (items.length > 0) ctx.openCtx(x, y, items);
}

/** Right-click on a group entry in the sidebar. */
export function buildGroupCtx(ctx: ShellMenuCtx, e: React.MouseEvent, groupId: string) {
  if (ctx.isGuest) return;
  const g = ctx.groups.find((x) => x.id === groupId);
  if (!g) return;
  const editable = ctx.canEditGroup(groupId);
  const items: CtxItem[] = [];
  if (editable) {
    items.push({
      icon: "edit",
      label: "重命名",
      onClick: async () => {
        const next = await promptDialog("分组名称", g.name, "重命名前");
        if (next && next.trim() && next !== g.name) {
          void ctx.updateGroup(groupId, { name: next.trim() });
        }
      },
    });
    items.push({ divider: true });
    items.push({
      icon: "trash",
      label: "删除分组",
      danger: true,
      onClick: async () => {
        if (await confirmDialog(`删除"${g.name}"及其所有图标/组件?`)) void ctx.deleteGroup(groupId);
      },
    });
  }
  if (items.length > 0) ctx.openCtx(e.clientX, e.clientY, items);
}

/** Right-click on the sidebar empty area. */
export function buildSideCtx(ctx: ShellMenuCtx, e: React.MouseEvent) {
  const items: CtxItem[] = [];
  if (!ctx.isGuest) {
    items.push({ icon: "plus", label: "新建分组", onClick: () => ctx.setAddCatOpen(true) });
    items.push({ divider: true });
  }
  items.push({
    icon: ctx.sidebarMode === "pinned" ? "check" : "blank",
    label: "长期驻留",
    onClick: () => void ctx.updateTweaks({ sidebar: "pinned" }),
  });
  items.push({
    icon: ctx.sidebarMode === "autohide" ? "check" : "blank",
    label: "自动隐藏",
    onClick: () => void ctx.updateTweaks({ sidebar: "autohide" }),
  });
  items.push({
    icon: ctx.sidebarMode === "hidden" ? "check" : "blank",
    label: "一直隐藏",
    onClick: () => void ctx.updateTweaks({ sidebar: "hidden" }),
  });
  ctx.openCtx(e.clientX, e.clientY, items);
}
