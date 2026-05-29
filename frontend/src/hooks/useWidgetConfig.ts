import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  /** UX-16: 最近一次自动保存是否失败(用于 UI 显示「保存失败」)。 */
  saveError: boolean;
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
  const [saveError, setSaveError] = useState(false);

  const timerRef = useRef<number | null>(null);
  const latestRef = useRef<T>(config);
  const inFlightRef = useRef(false);
  // 防止失败 toast 刷屏:同一次故障期间只提示一次,保存成功后复位。
  const errorNotifiedRef = useRef(false);

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
      await api.updateWidget(w.id, {
        config: snapshot as unknown as Record<string, unknown>,
      });
      updateWidgetLocal(w.id, snapshot as unknown as Record<string, unknown>);
      setSavedAt(Date.now());
      // UX-16: 保存成功,清除失败态并允许下次故障再次提示。
      setSaveError(false);
      errorNotifiedRef.current = false;
    } catch (e) {
      console.error("useWidgetConfig save failed", e);
      // UX-16: 自动保存失败不再静默——置失败态并(每段故障)提示一次。
      setSaveError(true);
      if (!errorNotifiedRef.current) {
        errorNotifiedRef.current = true;
        toast.error("自动保存失败，修改可能未生效");
      }
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

  return { config, update, replace, saving, savedAt, saveError };
}
