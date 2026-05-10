import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import {
  GroupView,
  IconView,
  Me,
  Tweaks,
  WidgetView,
  Workspace,
} from "../types";
import { api } from "../api";
import { toast } from "sonner";
import { WIDGET_REGISTRY, WIDGET_SIZE_DIMENSIONS, type WidgetSizeId } from "../widgets";

interface WorkspaceContextProps {
  me: Me | null;
  isGuest: boolean;
  workspace: Workspace;
  activeGroup: string;
  setActiveGroup: (id: string) => void;
  updateTweaks: (t: Partial<Tweaks>) => void;
  reorderGroup: (oldId: string, newId: string) => void;
  reorderIcon: (dragId: string, dropId: string) => void;
  reorderGroupItems: (groupId: string, items: { id: string; type: "icon" | "widget"; x: number | null; y: number | null }[]) => void;
  mergeIcon: (sourceId: string, targetId: string) => Promise<void>;
  extractFolderItem: (folderId: string, itemId: string) => Promise<void>;
  reorderFolderItems: (folderId: string, order: string[]) => Promise<void>;
  /** 图标/组件 的本地状态更新 + API 调用 */

  updateIcon: (id: string, patch: Partial<IconView>) => Promise<void>;
  deleteIcon: (id: string) => Promise<void>;
  updateWidget: (id: string, patch: Partial<WidgetView>) => Promise<void>;
  updateWidgetLocal: (id: string, config: Record<string, unknown>) => void;
  deleteWidget: (id: string) => Promise<void>;
  addWidget: (groupId: string, kind: string, size?: WidgetSizeId) => Promise<void>;
  addIcon: (body: Partial<IconView> & { groupId: string; name: string }) => Promise<IconView | null>;
  updateGroup: (id: string, patch: Partial<GroupView>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addGroup: (name: string, icon?: string) => Promise<void>;
  canEditGroup: (groupId: string) => boolean;
  addCustomEngine: (input: { name: string; url: string; color?: string; label?: string }) => Promise<void>;
  deleteCustomEngine: (id: string) => Promise<void>;
  refreshWorkspace: () => void;
  updateMe: (patch: { avatarUrl?: string | null; displayName?: string | null }) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextProps | null>(null);

function arrUpdate<T extends { id: string }>(arr: T[], id: string, patch: Partial<T>): T[] {
  return arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

function arrRemove<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((x) => x.id !== id);
}

export function WorkspaceProvider({
  children,
  initialMe,
  initialWorkspace,
  onReload,
}: {
  children: React.ReactNode;
  initialMe: Me | null;
  initialWorkspace: Workspace;
  onReload?: () => void;
}) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  
  useEffect(() => {
    setWorkspace(initialWorkspace);
  }, [initialWorkspace]);

  useEffect(() => {
    setMe(initialMe);
  }, [initialMe]);

  // Always land on the first group (the "home" tab) on every fresh mount —
  // same behavior for guest and authenticated users. We don't persist
  // navigation state, so this is the entry point for every visit.
  const [activeGroup, setActiveGroup] = useState(
    workspace.groups[0]?.id || "home",
  );
  const isGuest = me === null;

  // If the current activeGroup isn't in the workspace (e.g. cold-start
  // skeleton replaced by real data, or the active group got deleted),
  // snap back to the first group.
  useEffect(() => {
    if (workspace.groups.length === 0) return;
    if (!workspace.groups.some((g) => g.id === activeGroup)) {
      setActiveGroup(workspace.groups[0].id);
    }
  }, [workspace.groups, activeGroup]);

  const canEditGroup = useCallback(
    (id: string) => {
      if (isGuest) return false;
      const g = workspace.groups.find((x) => x.id === id);
      return g ? !g.readOnly : false;
    },
    [isGuest, workspace.groups],
  );

  const updateTweaks = useCallback(
    async (t: Partial<Tweaks>) => {
      let nextTweaks: Tweaks = {};
      setWorkspace((s) => ({
        ...s,
        preferences: {
          ...s.preferences,
          tweaks: (nextTweaks = { ...s.preferences.tweaks, ...t }),
        },
      }));
      if (isGuest) {
        try {
          window.localStorage.setItem("navhub_guest_tweaks", JSON.stringify(nextTweaks));
        } catch (e) {}
        return;
      }
      try {
        await api.patchPrefs({ tweaks: nextTweaks });
      } catch (e) {
        console.error("Failed to patch tweaks", e);
        toast.error("偏好设置保存失败");
      }
    },
    [isGuest],
  );

  const reorderGroup = useCallback(
    (oldId: string, newId: string) => {
      if (isGuest) return;
      setWorkspace((s) => {
        const gs = s.groups.slice();
        const fi = gs.findIndex((g) => g.id === oldId);
        const ti = gs.findIndex((g) => g.id === newId);
        if (fi < 0 || ti < 0) return s;
        const [m] = gs.splice(fi, 1);
        gs.splice(ti, 0, m);
        api
          .reorderGroups(gs.map((g) => g.id))
          .catch((e) => console.error("reorderGroups failed", e));
        return { ...s, groups: gs };
      });
    },
    [isGuest],
  );

  const reorderIcon = useCallback(
    (dragId: string, dropId: string) => {
      if (isGuest) return;
      setWorkspace((s) => {
        const icons = s.icons.slice();
        const drag = icons.find((i) => i.id === dragId);
        const drop = icons.find((i) => i.id === dropId);
        if (!drag || !drop || drag.groupId !== drop.groupId) return s;
        const sameGroup = icons.filter((i) => i.groupId === drag.groupId);
        const fi = sameGroup.findIndex((i) => i.id === dragId);
        const ti = sameGroup.findIndex((i) => i.id === dropId);
        if (fi < 0 || ti < 0) return s;
        const [m] = sameGroup.splice(fi, 1);
        sameGroup.splice(ti, 0, m);
        const rest = icons.filter((i) => i.groupId !== drag.groupId);
        const order = sameGroup.map((i) => i.id);
        // fire-and-forget
        api
          .reorderIcons(drag.groupId, order)
          .catch((e) => console.error("reorderIcons failed", e));
        return { ...s, icons: [...rest, ...sameGroup] };
      });
    },
    [isGuest],
  );

  const reorderGroupItems = useCallback(
    (groupId: string, items: { id: string; type: "icon" | "widget"; x: number | null; y: number | null }[]) => {
      if (isGuest) return;
      setWorkspace((s) => {
        let icons = [...s.icons];
        let widgets = [...s.widgets];
        items.forEach((it, idx) => {
          if (it.type === "icon") {
            const idxIcon = icons.findIndex((i) => i.id === it.id);
            if (idxIcon >= 0) icons[idxIcon] = { ...icons[idxIcon], sortOrder: idx, gridX: it.x, gridY: it.y };
          } else {
            const idxWidget = widgets.findIndex((w) => w.id === it.id);
            if (idxWidget >= 0) widgets[idxWidget] = { ...widgets[idxWidget], sortOrder: idx, gridX: it.x, gridY: it.y };
          }
        });
        return { ...s, icons, widgets };
      });
      void (async () => {
        try {
          await api.reorderGroupItems(groupId, items);
          const latest = await api.workspace();
          const expected = items.map((x) => `${x.type}:${x.id}`);
          const latestGroupItems = [
            ...latest.widgets
              .filter((w) => w.groupId === groupId && !WIDGET_REGISTRY[w.widget]?.floatingBar)
              .map((w) => ({ type: "widget" as const, id: w.id, sortOrder: w.sortOrder })),
            ...latest.icons
              .filter((i) => i.groupId === groupId)
              .map((i) => ({ type: "icon" as const, id: i.id, sortOrder: i.sortOrder })),
          ]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((x) => `${x.type}:${x.id}`);
          if (
            expected.length !== latestGroupItems.length ||
            expected.some((v, idx) => v !== latestGroupItems[idx])
          ) {
            console.error("reorder mismatch after save", {
              groupId,
              expected,
              latestGroupItems,
            });
            toast.error("排序未生效：服务器返回顺序与提交不一致");
          }
          setWorkspace(latest);
        } catch (e) {
          console.error("reorderGroupItems failed", e);
          toast.error("排序保存失败");
          if (onReload) onReload();
        }
      })();
    },
    [isGuest, onReload],
  );

  const mergeIcon = useCallback(
    async (sourceId: string, targetId: string) => {
      if (isGuest) return;
      try {
        const targetView = await api.mergeIcon(sourceId, targetId);
        setWorkspace((ws) => {
          const nextIcons = ws.icons.filter((i) => i.id !== sourceId).map((i) => (i.id === targetId ? targetView : i));
          return { ...ws, icons: nextIcons };
        });
      } catch (e) {
        console.error("mergeIcon failed", e);
        toast.error("合并图标失败");
      }
    },
    [isGuest],
  );

  const reorderFolderItems = useCallback(
    async (folderId: string, order: string[]) => {
      if (isGuest) return;
      // optimistic local update
      setWorkspace((ws) => {
        const nextIcons = ws.icons.map((i) => {
          if (i.id !== folderId || !i.isFolder) return i;
          const items = i.folderItems || [];
          const byId = new Map(items.map((it) => [it.id, it] as const));
          const reordered = order
            .map((id, idx) => {
              const it = byId.get(id);
              return it ? { ...it, sortOrder: idx } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
          return { ...i, folderItems: reordered };
        });
        return { ...ws, icons: nextIcons };
      });
      try {
        await api.reorderFolderItems(folderId, order);
      } catch (e) {
        console.error("reorderFolderItems failed", e);
        toast.error("文件夹排序保存失败");
        if (onReload) onReload();
      }
    },
    [isGuest, onReload],
  );

  const extractFolderItem = useCallback(
    async (folderId: string, itemId: string) => {
      if (isGuest) return;
      try {
        const [folderView, newItemView] = await api.extractFolderItem(folderId, itemId);
        setWorkspace((ws) => {
          const nextIcons = ws.icons.map((i) => (i.id === folderId ? folderView : i));
          nextIcons.push(newItemView);
          return { ...ws, icons: nextIcons };
        });
      } catch (e) {
        console.error("extractFolderItem failed", e);
        toast.error("提取图标失败");
      }
    },
    [isGuest],
  );

  const updateIcon = useCallback(
    async (id: string, patch: Partial<IconView>) => {
      setWorkspace((s) => ({ ...s, icons: arrUpdate(s.icons, id, patch) }));
      try {
        await api.updateIcon(id, patch);
      } catch (e) {
        console.error("updateIcon failed", e);
        toast.error("更新图标失败");
      }
    },
    [],
  );

  const deleteIcon = useCallback(async (id: string) => {
    setWorkspace((s) => ({ ...s, icons: arrRemove(s.icons, id) }));
    try {
      await api.deleteIcon(id);
    } catch (e) {
      console.error("deleteIcon failed", e);
      toast.error("删除图标失败");
    }
  }, []);

  const updateWidget = useCallback(
    async (id: string, patch: Partial<WidgetView>) => {
      setWorkspace((s) => ({ ...s, widgets: arrUpdate(s.widgets, id, patch) }));
      try {
        await api.updateWidget(id, patch);
      } catch (e) {
        console.error("updateWidget failed", e);
        toast.error("更新组件失败");
      }
    },
    [],
  );

  const updateWidgetLocal = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setWorkspace((s) => ({
        ...s,
        widgets: arrUpdate(s.widgets, id, { config }),
      }));
    },
    [],
  );

  const deleteWidget = useCallback(async (id: string) => {
    setWorkspace((s) => ({ ...s, widgets: arrRemove(s.widgets, id) }));
    try {
      await api.deleteWidget(id);
    } catch (e) {
      console.error("deleteWidget failed", e);
      toast.error("删除组件失败");
    }
  }, []);

  const addWidget = useCallback(
    async (groupId: string, kind: string, size?: WidgetSizeId) => {
      try {
        const sizeKey = size ?? WIDGET_REGISTRY[kind]?.defaultSize ?? "medium";
        const dim = WIDGET_SIZE_DIMENSIONS[sizeKey];
        const w = await api.createWidget({
          groupId,
          widget: kind,
          wSpan: dim.wSpan,
          wRow: dim.wRow,
        });
        setWorkspace((s) => ({ ...s, widgets: [...s.widgets, w] }));
      } catch (e) {
        console.error("addWidget failed", e);
        toast.error("添加组件失败");
      }
    },
    [],
  );

  const addIcon = useCallback(
    async (body: Partial<IconView> & { groupId: string; name: string }) => {
      try {
        const ic = await api.createIcon(body);
        setWorkspace((s) => ({ ...s, icons: [...s.icons, ic] }));
        return ic;
      } catch (e) {
        console.error("addIcon failed", e);
        toast.error("添加图标失败");
        return null;
      }
    },
    [],
  );

  const updateGroup = useCallback(
    async (id: string, patch: Partial<GroupView>) => {
      setWorkspace((s) => ({ ...s, groups: arrUpdate(s.groups, id, patch) }));
      try {
        await api.updateGroup(id, { name: patch.name, icon: patch.icon });
      } catch (e) {
        console.error("updateGroup failed", e);
        toast.error("更新分组失败");
      }
    },
    [],
  );

  const deleteGroup = useCallback(async (id: string) => {
    setWorkspace((s) => ({
      ...s,
      groups: arrRemove(s.groups, id),
      icons: s.icons.filter((i) => i.groupId !== id),
      widgets: s.widgets.filter((w) => w.groupId !== id),
    }));
    try {
      await api.deleteGroup(id);
    } catch (e) {
      console.error("deleteGroup failed", e);
      toast.error("删除分组失败");
    }
  }, []);

  const addGroup = useCallback(async (name: string, icon = "grid") => {
    try {
      const g = await api.createGroup({ name, icon });
      setWorkspace((s) => ({ ...s, groups: [...s.groups, g] }));
      setActiveGroup(g.id);
    } catch (e) {
      console.error("addGroup failed", e);
      toast.error("添加分组失败");
    }
  }, []);

  const addCustomEngine = useCallback(
    async (input: { name: string; url: string; color?: string; label?: string }) => {
      const arr = await api.addEngine(input);
      setWorkspace((ws) => ({
        ...ws,
        preferences: { ...ws.preferences, customEngines: arr },
      }));
    },
    [],
  );

  const deleteCustomEngine = useCallback(
    async (id: string) => {
      await api.deleteEngine(id);
      const arr = await api.listEngines();
      setWorkspace((ws) => ({
        ...ws,
        preferences: { ...ws.preferences, customEngines: arr },
      }));
    },
    [],
  );

  const refreshWorkspace = useCallback(() => {
    if (onReload) onReload();
  }, [onReload]);

  const updateMe = useCallback(async (patch: { avatarUrl?: string | null; displayName?: string | null }) => {
    if (isGuest) return;
    try {
      const updated = await api.patchMe(patch);
      setMe(updated);
    } catch (e) {
      console.error("updateMe failed", e);
      toast.error("更新个人信息失败");
    }
  }, [isGuest]);

  const value = useMemo(
    () => ({
      me,
      isGuest,
      workspace,
      activeGroup,
      setActiveGroup,
      updateTweaks,
      reorderGroup,
      reorderIcon,
      reorderGroupItems,
      mergeIcon,
      extractFolderItem,
      reorderFolderItems,
      updateIcon,

      deleteIcon,
      updateWidget,
      updateWidgetLocal,
      deleteWidget,
      addWidget,
      addIcon,
      updateGroup,
      deleteGroup,
      addGroup,
      canEditGroup,
      addCustomEngine,
      deleteCustomEngine,
      refreshWorkspace,
      updateMe,
    }),
    [
      me,
      isGuest,
      workspace,
      activeGroup,
      updateTweaks,
      reorderGroup,
      reorderIcon,
      reorderGroupItems,
      mergeIcon,
      extractFolderItem,
      reorderFolderItems,
      updateIcon,

      deleteIcon,
      updateWidget,
      updateWidgetLocal,
      deleteWidget,
      addWidget,
      addIcon,
      updateGroup,
      deleteGroup,
      addGroup,
      canEditGroup,
      addCustomEngine,
      deleteCustomEngine,
      refreshWorkspace,
      updateMe,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
