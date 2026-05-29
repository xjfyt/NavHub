import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  refreshMs?: number;
  enabled?: boolean;
}

interface Result<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useWidgetData<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[],
  opts: Options = {},
): Result<T> {
  const { refreshMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const genRef = useRef(0);
  // FE-3: 持有当前在途请求的 AbortController,以便在卸载 / 依赖变化 /
  // 下一次刷新前主动中止,杜绝卸载后 setState 与请求竞态。
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!enabled) return;
    // 取消上一次仍在途的请求(依赖变化或手动 refresh 触发的新一轮)。
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++genRef.current;
    setLoading(true);
    try {
      const v = await fetcher(controller.signal);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    run();
    if (!refreshMs || !enabled) {
      return () => abortRef.current?.abort();
    }
    const id = window.setInterval(run, refreshMs);
    return () => {
      window.clearInterval(id);
      // 卸载 / 依赖变化时中止在途请求,避免 setState-after-unmount。
      abortRef.current?.abort();
    };
  }, [run, refreshMs, enabled]);

  return { data, loading, error, refresh: run };
}
