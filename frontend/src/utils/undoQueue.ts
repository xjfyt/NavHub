// UX-11: 危险删除的「撤销」队列。
//
// 把「乐观地从 UI 移除 + 延迟若干秒再真正落库」的纯逻辑抽出来,便于单测:
//   - schedule(): 登记一个待删除项,delayMs 后自动 commit(真正落库)。
//   - cancel():   用户点击「撤销」时取消待删除,触发 onUndo(恢复 UI)。
//   - flushAll(): 组件卸载/离开页面时立即把所有未决删除落库,绝不静默丢数据。
//
// 这里不直接依赖 React / 计时器以外的任何东西,setTimeout/clearTimeout 走 globalThis,
// 既能在浏览器跑,也能在 vitest 的 fake timers 下被精确推进。

// QUAL-14: 危险删除的「撤销」窗口默认时长。期间用户可点「撤销」恢复,到点才真正落库。
// 作为单一事实来源导出,useWorkspace 等调用方复用,避免 5s 这个有含义的数字重复散落。
export const DEFAULT_UNDO_DELAY_MS = 5000;

export interface UndoEntry {
  /** 唯一标识(被删除对象的 id);相同 id 再次 schedule 会替换前一个。 */
  id: string;
  /** 计时到点 / flush 时执行的真正落库操作。 */
  commit: () => Promise<unknown> | unknown;
  /** 用户撤销时调用——用于恢复 UI。 */
  onUndo?: () => void;
  /** commit 结束(成功或失败)后调用,err 为空表示成功。 */
  onSettled?: (err?: unknown) => void;
}

export interface UndoQueueOptions {
  /** 自动提交的延迟,默认 DEFAULT_UNDO_DELAY_MS(5000ms)。 */
  delayMs?: number;
}

export interface UndoQueue {
  /** 登记一个待删除项。 */
  schedule: (entry: UndoEntry) => void;
  /** 撤销待删除;返回是否确实撤销了一个未决项。 */
  cancel: (id: string) => boolean;
  /** 立即提交所有未决删除(卸载/离开时调用)。 */
  flushAll: () => void;
  /** 当前所有未决删除的 id 列表(用于测试/调试)。 */
  pendingIds: () => string[];
  /** 该 id 是否处于未决状态。 */
  has: (id: string) => boolean;
}

interface PendingItem {
  entry: UndoEntry;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createUndoQueue(options: UndoQueueOptions = {}): UndoQueue {
  const delayMs = options.delayMs ?? DEFAULT_UNDO_DELAY_MS;
  const pending = new Map<string, PendingItem>();

  const clearTimer = (item: PendingItem) => {
    if (item.timer !== null) {
      clearTimeout(item.timer);
      item.timer = null;
    }
  };

  const runCommit = (entry: UndoEntry) => {
    let result: Promise<unknown> | unknown;
    try {
      result = entry.commit();
    } catch (err) {
      entry.onSettled?.(err);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => entry.onSettled?.(),
        (err) => entry.onSettled?.(err),
      );
    } else {
      entry.onSettled?.();
    }
  };

  const schedule = (entry: UndoEntry) => {
    // 同 id 重复登记:先撤掉旧定时器,避免双重提交。
    const prev = pending.get(entry.id);
    if (prev) clearTimer(prev);

    const item: PendingItem = { entry, timer: null };
    item.timer = setTimeout(() => {
      // 到点:从队列移除后再 commit,保证 commit 内部即便再次 schedule 也不冲突。
      pending.delete(entry.id);
      item.timer = null;
      runCommit(entry);
    }, delayMs);
    pending.set(entry.id, item);
  };

  const cancel = (id: string): boolean => {
    const item = pending.get(id);
    if (!item) return false;
    clearTimer(item);
    pending.delete(id);
    item.entry.onUndo?.();
    return true;
  };

  const flushAll = () => {
    // 快照后清空,避免 commit 过程中 Map 被并发改写。
    const items = Array.from(pending.values());
    pending.clear();
    for (const item of items) {
      clearTimer(item);
      runCommit(item.entry);
    }
  };

  return {
    schedule,
    cancel,
    flushAll,
    pendingIds: () => Array.from(pending.keys()),
    has: (id: string) => pending.has(id),
  };
}
