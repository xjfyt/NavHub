// I18N-1: 手搓的轻量 i18n 纯逻辑层(不依赖任何 npm i18n 库)。
// 这里只放「纯函数」——查表 + {name} 插值 + 回退链 + 语言探测——便于详尽单测;
// React 层的 context/hook 见 index.tsx。

/** 当前支持的语言。zh 为源真相(source-of-truth)语言,en 渐进补全。 */
export type Lang = "zh" | "en";

/** 已注册的全部语言代码,供 detectLang 校验偏好合法性。 */
export const LANGS: Lang[] = ["zh", "en"];

/** 单门语言的字典:扁平 key -> 文案。 */
export type Dict = Record<string, string>;

/** 全部语言的字典集合。 */
export type Dictionaries = Record<Lang, Dict>;

/** 插值参数:{name} 形式占位符的取值。 */
export type TParams = Record<string, string | number>;

/** 默认回退语言:任何语言缺 key 时回退到中文。 */
export const DEFAULT_FALLBACK_LANG: Lang = "zh";

/** 占位符语法:{name} / {count} 等。允许字母、数字、下划线。 */
const PLACEHOLDER = /\{(\w+)\}/g;

/** 把模板里的 {key} 用 params 替换;缺失的参数原样保留占位符(不抛错)。 */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? whole : String(v);
  });
}

/**
 * 纯 t():在 dicts 中按 lang -> fallbackLang -> key 本身 的顺序查找文案,命中后插值。
 *
 * 回退链:
 *   1. 当前语言 lang 命中(含命中空串「""」也算命中,原样返回)。
 *   2. 否则尝试 fallbackLang(默认 zh)。
 *   3. 仍未命中 -> 返回 key 本身(便于开发期发现漏翻)。
 *
 * @param dicts        全部语言字典
 * @param lang         当前语言(允许传未注册代码,会直接走回退)
 * @param key          文案 key
 * @param params       可选插值参数
 * @param fallbackLang 回退语言,默认 zh
 */
export function translate(
  dicts: Dictionaries,
  lang: Lang,
  key: string,
  params?: TParams,
  fallbackLang: Lang = DEFAULT_FALLBACK_LANG,
): string {
  const primary = dicts[lang];
  if (primary && Object.prototype.hasOwnProperty.call(primary, key)) {
    return interpolate(primary[key], params);
  }
  const fb = dicts[fallbackLang];
  if (fb && Object.prototype.hasOwnProperty.call(fb, key)) {
    return interpolate(fb[key], params);
  }
  return key;
}

/**
 * 语言探测纯逻辑:
 *   1. 若存在合法的用户偏好(stored ∈ LANGS),优先采用。
 *   2. 否则看 navigator.language:zh* -> zh,其它 -> en。
 *   3. navigator 缺失 -> en。
 * 大小写不敏感。
 */
export function detectLang(input: {
  stored: string | null | undefined;
  navigator: string | null | undefined;
}): Lang {
  const stored = input.stored?.toLowerCase();
  if (stored && (LANGS as string[]).includes(stored)) {
    return stored as Lang;
  }
  const nav = (input.navigator || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  return "en";
}
