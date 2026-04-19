import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetView } from "../types";
import { api } from "../api";
import { PREVIEW_WIDGET_ID } from "../widgets/types";
import { useWorkspace } from "./useWorkspace";

interface Options {
  debounceMs?: number;
}

interface Result<T> {
  config: T;
  update: (patch: Partial<T>) => void;
  replace: (next: T) => void;
  saving: boolean;
  savedAt: number | null;
}

export function useWidgetConfig<T extends object>(
  w: WidgetView | undefined,
  defaults: T,
  opts: Options = {},
): Result<T> {
  const debounceMs = opts.debounceMs ?? 600;
  const { isGuest, updateWidgetLocal } = useWorkspace();
  const readOnly = !w || w.readOnly || w.id === PREVIEW_WIDGET_ID;

  const [config, setConfig] = useState<T>(() => ({
    ...defaults,
    ...((w?.config as Partial<T>) ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const latestRef = useRef<T>(config);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!w) return;
    const next = { ...defaults, ...((w.config as Partial<T>) ?? {}) };
    latestRef.current = next;
    setConfig(next);
    // Only re-sync when the server-side config object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w?.id, w?.config]);

  const pendingRef = useRef(false);

  const flush = useCallback(async () => {
    if (!w) return;
    if (inFlightRef.current) {
      pendingRef.current = true; // wait for current to finish
      return;
    }
    const snapshot = latestRef.current;
    inFlightRef.current = true;
    setSaving(true);
    try {
      await api.updateWidget(w.id, { config: snapshot as unknown as Record<string, unknown> });
      updateWidgetLocal(w.id, snapshot as unknown as Record<string, unknown>);
      setSavedAt(Date.now());
    } catch (e) {
      console.error("useWidgetConfig save failed", e);
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        flush();
      } else {
        setSaving(false);
      }
    }
  }, [updateWidgetLocal, w]);

  const schedule = useCallback(() => {
    if (readOnly || isGuest || !w) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, debounceMs);
  }, [debounceMs, flush, isGuest, readOnly, w]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        latestRef.current = next;
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const replace = useCallback(
    (next: T) => {
      setConfig(next);
      latestRef.current = next;
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { config, update, replace, saving, savedAt };
}
