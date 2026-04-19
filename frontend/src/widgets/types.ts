import type { WidgetView } from "../types";

export interface WidgetProps<T = Record<string, unknown>> {
  w?: WidgetView;
  defaultConfig?: T;
}

export const PREVIEW_WIDGET_ID = "__preview__";

export function isPreview(w?: WidgetView): boolean {
  return !w || w.id === PREVIEW_WIDGET_ID;
}
