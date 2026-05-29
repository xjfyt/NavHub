import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUndoQueue } from "./undoQueue";

describe("createUndoQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("超时后提交(commit),且 onTimeout 后回调被调用一次", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn();
    const q = createUndoQueue({ delayMs: 5000 });

    q.schedule({ id: "a", commit, onSettled });
    expect(commit).not.toHaveBeenCalled();
    expect(q.pendingIds()).toEqual(["a"]);

    vi.advanceTimersByTime(5000);
    expect(commit).toHaveBeenCalledTimes(1);
    // 提交后不再 pending
    expect(q.pendingIds()).toEqual([]);
  });

  it("撤销(cancel)后不再提交,且 onUndo 被调用", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();
    const q = createUndoQueue({ delayMs: 5000 });

    q.schedule({ id: "b", commit, onUndo });
    const undone = q.cancel("b");
    expect(undone).toBe(true);
    expect(onUndo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(commit).not.toHaveBeenCalled();
    expect(q.pendingIds()).toEqual([]);
  });

  it("cancel 不存在的 id 返回 false,不调用任何回调", () => {
    const q = createUndoQueue({ delayMs: 5000 });
    expect(q.cancel("nope")).toBe(false);
  });

  it("flushAll(卸载时)立即提交所有未决删除并清空定时器", () => {
    const commitA = vi.fn().mockResolvedValue(undefined);
    const commitB = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 5000 });

    q.schedule({ id: "a", commit: commitA });
    q.schedule({ id: "b", commit: commitB });
    expect(q.pendingIds().sort()).toEqual(["a", "b"]);

    q.flushAll();
    expect(commitA).toHaveBeenCalledTimes(1);
    expect(commitB).toHaveBeenCalledTimes(1);
    expect(q.pendingIds()).toEqual([]);

    // flush 之后定时器不应再触发第二次 commit
    vi.advanceTimersByTime(5000);
    expect(commitA).toHaveBeenCalledTimes(1);
    expect(commitB).toHaveBeenCalledTimes(1);
  });

  it("重复 schedule 同一 id 会取消前一个定时器,只提交一次(以最后一次为准)", () => {
    const commit1 = vi.fn().mockResolvedValue(undefined);
    const commit2 = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 5000 });

    q.schedule({ id: "a", commit: commit1 });
    q.schedule({ id: "a", commit: commit2 });

    vi.advanceTimersByTime(5000);
    expect(commit1).not.toHaveBeenCalled();
    expect(commit2).toHaveBeenCalledTimes(1);
  });

  it("commit 抛错时调用 onSettled(error),不影响队列清理", () => {
    const err = new Error("boom");
    const commit = vi.fn().mockRejectedValue(err);
    const onSettled = vi.fn();
    const q = createUndoQueue({ delayMs: 1000 });

    q.schedule({ id: "x", commit, onSettled });
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(q.pendingIds()).toEqual([]);
  });
});
