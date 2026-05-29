import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTtlCache } from "./ttlCache";

describe("createTtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("命中:TTL 内 set 后 get 返回缓存值", () => {
    const cache = createTtlCache<number>();
    cache.set("a", 42, 1000);
    expect(cache.get("a")).toBe(42);
  });

  it("未命中:从未写入的 key 返回 undefined", () => {
    const cache = createTtlCache<number>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("过期:超过 TTL 后 get 返回 undefined 并清除条目", () => {
    const cache = createTtlCache<number>();
    cache.set("a", 42, 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe(42);
    vi.advanceTimersByTime(2); // 越过 1000ms 边界
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("TTL=0 表示立即过期(不缓存)", () => {
    const cache = createTtlCache<number>();
    cache.set("a", 42, 0);
    vi.advanceTimersByTime(1);
    expect(cache.get("a")).toBeUndefined();
  });

  it("set 覆盖旧值并刷新过期时间", () => {
    const cache = createTtlCache<number>();
    cache.set("a", 1, 1000);
    vi.advanceTimersByTime(800);
    cache.set("a", 2, 1000);
    vi.advanceTimersByTime(800); // 距第二次 set 仅 800ms
    expect(cache.get("a")).toBe(2);
  });

  it("invalidate 移除指定 key,clear 清空全部", () => {
    const cache = createTtlCache<number>();
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.invalidate("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  describe("getOrFetch 在途去重", () => {
    it("命中缓存时直接返回,不调用 fetcher", async () => {
      const cache = createTtlCache<number>();
      cache.set("a", 7, 1000);
      const fetcher = vi.fn(() => Promise.resolve(99));
      await expect(cache.getOrFetch("a", fetcher, 1000)).resolves.toBe(7);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("并发同 key 调用共享同一个 promise,fetcher 仅执行一次", async () => {
      const cache = createTtlCache<number>();
      let resolveFn!: (v: number) => void;
      const fetcher = vi.fn(
        () => new Promise<number>((res) => { resolveFn = res; }),
      );
      const p1 = cache.getOrFetch("a", fetcher, 1000);
      const p2 = cache.getOrFetch("a", fetcher, 1000);
      expect(fetcher).toHaveBeenCalledTimes(1);
      resolveFn(123);
      await expect(p1).resolves.toBe(123);
      await expect(p2).resolves.toBe(123);
    });

    it("成功后写入缓存,后续 get 命中且不再 fetch", async () => {
      const cache = createTtlCache<number>();
      const fetcher = vi.fn(() => Promise.resolve(5));
      await cache.getOrFetch("a", fetcher, 1000);
      expect(cache.get("a")).toBe(5);
      await cache.getOrFetch("a", fetcher, 1000);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("fetcher 失败时不写缓存,且清除在途记录以便重试", async () => {
      const cache = createTtlCache<number>();
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(8);
      await expect(cache.getOrFetch("a", fetcher, 1000)).rejects.toThrow("boom");
      expect(cache.get("a")).toBeUndefined();
      // 第二次应重新发起请求(在途记录已被清除)。
      await expect(cache.getOrFetch("a", fetcher, 1000)).resolves.toBe(8);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("ttl<=0 时成功结果不写入缓存(仍完成在途去重)", async () => {
      const cache = createTtlCache<number>();
      const fetcher = vi.fn(() => Promise.resolve(3));
      await expect(cache.getOrFetch("a", fetcher, 0)).resolves.toBe(3);
      expect(cache.get("a")).toBeUndefined();
    });
  });
});
