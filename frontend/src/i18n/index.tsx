// I18N-1: 轻量 i18n 的 React 层——context + useI18n/I18nProvider,持有当前 lang。
// 纯逻辑(查表/插值/回退/探测)在 ./translate;字典在 ./dictionaries。

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { dictionaries } from "./dictionaries";
import {
  detectLang,
  translate,
  LANGS,
  type Lang,
  type TParams,
} from "./translate";

export type { Lang, TParams } from "./translate";
export { LANGS } from "./translate";

/** localStorage 中持久化语言偏好的键。 */
const LANG_STORAGE_KEY = "navhub_lang";

function readStoredLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLang(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* localStorage 不可用(隐私模式等)——忽略,仅本会话生效。 */
  }
}

/** 初始语言:用户偏好(localStorage) > navigator.language(zh* -> zh,否则 en)。 */
function initialLang(): Lang {
  const nav =
    typeof navigator !== "undefined" ? navigator.language : undefined;
  return detectLang({ stored: readStoredLang(), navigator: nav });
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 文案查找 + 插值,内部固定走当前 lang 与全局字典。 */
  t: (key: string, params?: TParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
  }, []);

  const t = useCallback(
    (key: string, params?: TParams) =>
      translate(dictionaries, lang, key, params),
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 取当前语言 + setLang + t()。必须在 <I18nProvider> 内使用。 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within <I18nProvider>");
  }
  return ctx;
}

/** 可选项:供下拉选择语言用。 */
export const LANG_OPTIONS: { id: Lang; nameKey: string }[] = LANGS.map((l) => ({
  id: l,
  nameKey: `lang.${l}`,
}));
