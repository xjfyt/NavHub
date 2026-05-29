import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withTimeoutSignal,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./abortTimeout";

describe("withTimeoutSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认未触发:signal 不处于 abort", () => {
    const t = withTimeoutSignal();
    expect(t.signal.aborted).toBe(false);
    expect(t.didTimeout()).toBe(false);
    t.cleanup();
  });

  it("超时后 abort,且标记为 timeout", () => {
    const t = withTimeoutSignal(100);
    expect(t.signal.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    expect(t.signal.aborted).toBe(true);
    expect(t.didTimeout()).toBe(true);
    t.cleanup();
  });

  it("外部信号 abort 时同步中止,但不标记为 timeout", () => {
    const ext = new AbortController();
    const t = withTimeoutSignal(10_000, ext.signal);
    expect(t.signal.aborted).toBe(false);
    ext.abort();
    expect(t.signal.aborted).toBe(true);
    expect(t.didTimeout()).toBe(false);
    t.cleanup();
  });

  it("外部信号已处于 abort:立即中止", () => {
    const ext = new AbortController();
    ext.abort();
    const t = withTimeoutSignal(10_000, ext.signal);
    expect(t.signal.aborted).toBe(true);
    expect(t.didTimeout()).toBe(false);
    t.cleanup();
  });

  it("cleanup 后定时器不再触发 abort", () => {
    const t = withTimeoutSignal(100);
    t.cleanup();
    vi.advanceTimersByTime(1000);
    expect(t.signal.aborted).toBe(false);
    expect(t.didTimeout()).toBe(false);
  });

  it("提供合理的默认超时常量", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});
