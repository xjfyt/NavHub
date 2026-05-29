import { useCallback, useEffect, useRef, useState } from "react";
import { createTtlCache } from "../utils/ttlCache";

interface Options {
  refreshMs?: number;
  enabled?: boolean;
  /**
   * PERF-3: 给定一个稳定的请求标识(如 `rss:weibo`、`weather:北京`)即开启
   * 模块级 TTL 缓存 + 在途去重——磁贴与详情、以及 TTL 窗口内的重复挂载
   * 共享同一份数据/同一个在途请求,杜绝重复网络。不给则保持旧的「每次独立
   * 请求」行为(完全向后兼容)。
   */
  cacheKey?: string;
  /**
   * 缓存有效期(ms)。默认取 refreshMs(数据本就按此周期刷新,缓存不会比
   * 它更陈旧);refreshMs 缺省时回落到 DEFAULT_CACHE_TTL_MS。仅在提供
   * cacheKey 时生效。
   */
  cacheTtlMs?: number;
}

interface Result<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/** 无显式 refreshMs / cacheTtlMs 时的兜底缓存时长。 */
export const DEFAULT_CACHE_TTL_MS = 60_000;

// 模块级共享缓存:同一 cacheKey 的所有 widget 实例(磁贴 + 详情 + 重复挂载)
// 共用一份数据与同一个在途 Promise。值用 unknown 装箱,读取处按 T 取回。
const sharedCache = createTtlCache<unknown>();

/** 手动失效某个缓存键(供外部在写操作后强制下次重新拉取,本期未接入)。 */
export function invalidateWidgetData(key: string): void {
  sharedCache.invalidate(key);
}

export function useWidgetData<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[],
  opts: Options = {},
): Result<T> {
  const { refreshMs, enabled = true, cacheKey, cacheTtlMs } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const genRef = useRef(0);
  // FE-3: 持有当前在途请求的 AbortController,以便在卸载 / 依赖变化 /
  // 下一次刷新前主动中止,杜绝卸载后 setState 与请求竞态。
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (forceFresh = false) => {
      if (!enabled) return;
      // 取消上一次仍在途的请求(依赖变化或手动 refresh 触发的新一轮)。
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++genRef.current;
      setLoading(true);
      const ttl = cacheTtlMs ?? refreshMs ?? DEFAULT_CACHE_TTL_MS;
      try {
        let v: T;
        if (cacheKey) {
          // 手动刷新强制绕过缓存,并清掉旧值,确保拿到最新数据。
          if (forceFresh) sharedCache.invalidate(cacheKey);
          // PERF-3: 经共享缓存取数 —— 命中则零网络,未命中则与同 key 并发调用
          // 共享同一个在途 Promise。注意:此处不把 controller.signal 传给
          // fetcher,因为该请求可能被多个实例共享,某个实例卸载不应中止其他
          // 实例仍在等待的请求;abort 只用于「丢弃本实例的结果」(下方判断)。
          v = (await sharedCache.getOrFetch(
            cacheKey,
            () => fetcher() as Promise<unknown>,
            ttl,
          )) as T;
        } else {
          v = await fetcher(controller.signal);
        }
        if (gen === genRef.current && !controller.signal.aborted) {
          setData(v);
          setError(null);
        }
      } catch (e) {
        // 被主动中止(卸载 / 依赖变化)时静默丢弃,不写入已卸载组件的 state。
        if (controller.signal.aborted) return;
        if (gen === genRef.current) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (gen === genRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, cacheKey, cacheTtlMs, refreshMs, ...deps],
  );

  const refresh = useCallback(() => {
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => {
    run();
    if (!refreshMs || !enabled) {
      return () => abortRef.current?.abort();
    }
    const id = window.setInterval(() => run(true), refreshMs);
    return () => {
      window.clearInterval(id);
      // 卸载 / 依赖变化时中止在途请求,避免 setState-after-unmount。
      abortRef.current?.abort();
    };
  }, [run, refreshMs, enabled]);

  return { data, loading, error, refresh };
}
