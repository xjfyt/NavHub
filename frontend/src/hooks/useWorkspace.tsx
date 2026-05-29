import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  CustomEngine,
  GroupView,
  IconView,
  Me,
  Tweaks,
  WidgetView,
  Workspace,
} from "../types";
import { api } from "../api";
import { toast } from "sonner";
import { createUndoQueue } from "../utils/undoQueue";
import { WIDGET_REGISTRY, WIDGET_SIZE_DIMENSIONS, type WidgetSizeId } from "../widgets";

// UX-11: 危险删除延迟落库的时长。期间用户可点「撤销」恢复。
const UNDO_DELAY_MS = 5000;

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
  updateCustomEngine: (id: string, patch: { name?: string; url?: string }) => Promise<void>;
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

  // UX-11: 危险删除的「撤销」队列。乐观地从 UI 移除后,延迟若干秒再真正落库;
  // 期间用户点「撤销」即可取消并恢复 UI。卸载/离开页面时 flush 所有未决删除,
  // 保证数据绝不会因为「toast 还没到点」而静默丢失。
  const undoQueueRef = useRef(createUndoQueue({ delayMs: UNDO_DELAY_MS }));
  useEffect(() => {
    const queue = undoQueueRef.current;
    return () => {
      queue.flushAll();
    };
  }, []);

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
      // FE-5: 纯函数式计算下一态,API 调用移出 setWorkspace updater。
      // 之前把 api.reorderGroups 放在 updater 内,React StrictMode 会二次调用
      // updater,导致请求被重复发出且时序难以保证。
      const gs = workspace.groups.slice();
      const fi = gs.findIndex((g) => g.id === oldId);
      const ti = gs.findIndex((g) => g.id === newId);
      if (fi < 0 || ti < 0) return;
      const [m] = gs.splice(fi, 1);
      gs.splice(ti, 0, m);
      setWorkspace((s) => ({ ...s, groups: gs }));
      api
        .reorderGroups(gs.map((g) => g.id))
        .catch((e) => console.error("reorderGroups failed", e));
    },
    [isGuest, workspace.groups],
  );

  const reorderIcon = useCallback(
    (dragId: string, dropId: string) => {
      if (isGuest) return;
      // FE-5: 同上,纯函数式计算下一态后再触发 API,避免 updater 内副作用。
      const icons = workspace.icons.slice();
      const drag = icons.find((i) => i.id === dragId);
      const drop = icons.find((i) => i.id === dropId);
      if (!drag || !drop || drag.groupId !== drop.groupId) return;
      const sameGroup = icons.filter((i) => i.groupId === drag.groupId);
      const fi = sameGroup.findIndex((i) => i.id === dragId);
      const ti = sameGroup.findIndex((i) => i.id === dropId);
      if (fi < 0 || ti < 0) return;
      const [m] = sameGroup.splice(fi, 1);
      sameGroup.splice(ti, 0, m);
      const rest = icons.filter((i) => i.groupId !== drag.groupId);
      const order = sameGroup.map((i) => i.id);
      setWorkspace((s) => ({ ...s, icons: [...rest, ...sameGroup] }));
      api
        .reorderIcons(drag.groupId, order)
        .catch((e) => console.error("reorderIcons failed", e));
    },
    [isGuest, workspace.icons],
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
        toast.success("已合并到文件夹");
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
        toast.success("已移出文件夹");
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

  // UX-11: 删除站点/文件夹属于危险且不可逆操作 —— 采用「乐观移除 + 撤销」。
  // 先从 UI 把图标摘掉并快照它,弹出带「撤销」的 toast,延迟若干秒后才真正落库。
  // 撤销则把快照还原回原位;不撤销则到点提交。期间卸载会 flushAll 兜底提交。
  const deleteIcon = useCallback(async (id: string) => {
    let snapshot: IconView | undefined;
    setWorkspace((s) => {
      snapshot = s.icons.find((i) => i.id === id);
      return { ...s, icons: arrRemove(s.icons, id) };
    });
    if (!snapshot) return; // 不存在,无需处理
    const removed = snapshot;
    const isFolder = !!removed.isFolder;
    const label = isFolder ? "文件夹" : "站点";

    const toastId = toast.success(`已删除${label}「${removed.name}」`, {
      action: {
        label: "撤销",
        onClick: () => undoQueueRef.current.cancel(id),
      },
    });

    undoQueueRef.current.schedule({
      id,
      commit: async () => {
        try {
          await api.deleteIcon(id);
        } catch (e) {
          console.error("deleteIcon failed", e);
          // 落库失败:把图标还原回 UI,避免「界面已删但后端仍在」的不一致。
          setWorkspace((s) =>
            s.icons.some((i) => i.id === id) ? s : { ...s, icons: [...s.icons, removed] },
          );
          toast.error(`删除${label}失败,已恢复`);
        } finally {
          toast.dismiss(toastId);
        }
      },
      onUndo: () => {
        // 撤销:把快照还原回去。
        setWorkspace((s) =>
          s.icons.some((i) => i.id === id) ? s : { ...s, icons: [...s.icons, removed] },
        );
        toast.dismiss(toastId);
        toast.success("已撤销删除");
      },
    });
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
      toast.success("已删除组件");
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

  // UX-11: 删除分类(连同其下所有图标/组件)是高危且不可逆的批量删除。
  // 同样走「乐观移除 + 撤销 + 延迟落库」,并把分组及其全部内容快照下来用于还原。
  const deleteGroup = useCallback(async (id: string) => {
    let groupSnap: GroupView | undefined;
    let iconsSnap: IconView[] = [];
    let widgetsSnap: WidgetView[] = [];
    setWorkspace((s) => {
      groupSnap = s.groups.find((g) => g.id === id);
      iconsSnap = s.icons.filter((i) => i.groupId === id);
      widgetsSnap = s.widgets.filter((w) => w.groupId === id);
      return {
        ...s,
        groups: arrRemove(s.groups, id),
        icons: s.icons.filter((i) => i.groupId !== id),
        widgets: s.widgets.filter((w) => w.groupId !== id),
      };
    });
    if (!groupSnap) return;
    const group = groupSnap;
    const icons = iconsSnap;
    const widgets = widgetsSnap;
    const restore = () => {
      setWorkspace((s) =>
        s.groups.some((g) => g.id === id)
          ? s
          : {
              ...s,
              groups: [...s.groups, group],
              icons: [...s.icons, ...icons],
              widgets: [...s.widgets, ...widgets],
            },
      );
    };
    const countHint =
      icons.length + widgets.length > 0
        ? `(含 ${icons.length + widgets.length} 项内容)`
        : "";

    const queueKey = `group:${id}`;
    const toastId = toast.success(`已删除分类「${group.name}」${countHint}`, {
      action: {
        label: "撤销",
        onClick: () => undoQueueRef.current.cancel(queueKey),
      },
    });

    undoQueueRef.current.schedule({
      id: queueKey,
      commit: async () => {
        try {
          await api.deleteGroup(id);
        } catch (e) {
          console.error("deleteGroup failed", e);
          restore();
          toast.error("删除分类失败,已恢复");
        } finally {
          toast.dismiss(toastId);
        }
      },
      onUndo: () => {
        restore();
        toast.dismiss(toastId);
        toast.success("已撤销删除");
      },
    });
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
      // FE-7: 增加错误处理。调用方(TweaksPanel)依赖 reject 来区分成功/失败,
      // 因此这里在弹出 toast 后必须 re-throw,保持其 .then/.catch 分支正确。
      try {
        const arr = await api.addEngine(input);
        setWorkspace((ws) => ({
          ...ws,
          preferences: { ...ws.preferences, customEngines: arr },
        }));
      } catch (e) {
        console.error("addCustomEngine failed", e);
        toast.error("添加搜索引擎失败");
        throw e;
      }
    },
    [],
  );

  const updateCustomEngine = useCallback(
    async (id: string, patch: { name?: string; url?: string }) => {
      // UX-7: 后端无单条引擎编辑接口,但 PATCH /me/preferences 接受整份 custom_engines。
      // 这里在本地数组上就地改名/改 URL,再整体回写,并以返回值更新本地状态。
      const cur = Array.isArray(workspace.preferences.customEngines)
        ? (workspace.preferences.customEngines as CustomEngine[])
        : [];
      const next = cur.map((e) => (e.id === id ? { ...e, ...patch } : e));
      try {
        const prefs = await api.patchPrefs({ customEngines: next });
        setWorkspace((ws) => ({
          ...ws,
          preferences: { ...ws.preferences, customEngines: prefs.customEngines },
        }));
      } catch (e) {
        console.error("updateCustomEngine failed", e);
        toast.error("更新搜索引擎失败");
        throw e;
      }
    },
    [workspace.preferences.customEngines],
  );

  const deleteCustomEngine = useCallback(
    async (id: string) => {
      // FE-7: 该方法被 fire-and-forget 调用,无 .catch,失败前会静默丢失。
      // 包裹 try/catch 并弹出 toast,避免删除失败无任何反馈。
      try {
        await api.deleteEngine(id);
        const arr = await api.listEngines();
        setWorkspace((ws) => ({
          ...ws,
          preferences: { ...ws.preferences, customEngines: arr },
        }));
      } catch (e) {
        console.error("deleteCustomEngine failed", e);
        toast.error("删除搜索引擎失败");
      }
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
      updateCustomEngine,
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
      updateCustomEngine,
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
