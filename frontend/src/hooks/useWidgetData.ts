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
  fetcher: () => Promise<T>,
  deps: unknown[],
  opts: Options = {},
): Result<T> {
  const { refreshMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const genRef = useRef(0);

  const run = useCallback(async () => {
    if (!enabled) return;
    const gen = ++genRef.current;
    setLoading(true);
    try {
      const v = await fetcher();
      if (gen === genRef.current) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (gen === genRef.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    run();
    if (!refreshMs || !enabled) return;
    const id = window.setInterval(run, refreshMs);
    return () => window.clearInterval(id);
  }, [run, refreshMs, enabled]);

  return { data, loading, error, refresh: run };
}
