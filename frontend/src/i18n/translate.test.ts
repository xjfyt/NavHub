import { describe, it, expect } from "vitest";
import { translate, detectLang } from "./translate";
import type { Lang, Dictionaries } from "./translate";

// 测试用最小字典:zh 为源真相,en 部分填充(故意缺一个 key 以验证回退链)。
const dicts: Dictionaries = {
  zh: {
    "common.save": "保存",
    "common.cancel": "取消",
    "greet.hello": "你好，{name}！",
    "items.count": "共 {count} 项（{name}）",
    "only.zh": "仅中文",
  },
  en: {
    "common.save": "Save",
    "common.cancel": "Cancel",
    "greet.hello": "Hello, {name}!",
    "items.count": "{count} items ({name})",
    // 故意不提供 "only.zh" —— en 缺这个 key。
  },
};

describe("translate", () => {
  it("命中:返回当前语言的文案", () => {
    expect(translate(dicts, "en", "common.save")).toBe("Save");
    expect(translate(dicts, "zh", "common.save")).toBe("保存");
  });

  it("插值:{name} 被替换", () => {
    expect(translate(dicts, "en", "greet.hello", { name: "Ada" })).toBe(
      "Hello, Ada!",
    );
    expect(translate(dicts, "zh", "greet.hello", { name: "小明" })).toBe(
      "你好，小明！",
    );
  });

  it("插值:多个占位符,支持数字参数", () => {
    expect(
      translate(dicts, "en", "items.count", { count: 3, name: "Box" }),
    ).toBe("3 items (Box)");
  });

  it("插值:缺少的参数原样保留占位符(不抛错)", () => {
    expect(translate(dicts, "en", "greet.hello")).toBe("Hello, {name}!");
  });

  it("回退链:当前语言缺 key -> 回退语言(zh)", () => {
    // en 没有 only.zh,回退到 zh
    expect(translate(dicts, "en", "only.zh")).toBe("仅中文");
  });

  it("回退链:当前语言与回退语言都缺 key -> 返回 key 本身", () => {
    expect(translate(dicts, "en", "no.such.key")).toBe("no.such.key");
    expect(translate(dicts, "zh", "no.such.key")).toBe("no.such.key");
  });

  it("未知语言:整门语言不存在 -> 回退语言 -> key", () => {
    // @ts-expect-error 故意传入未注册的语言代码
    expect(translate(dicts, "fr", "common.save")).toBe("保存"); // 回退 zh
    // @ts-expect-error 同上:故意传入未注册的语言代码
    expect(translate(dicts, "fr", "no.key")).toBe("no.key");
  });

  it("自定义回退语言:fallbackLang 参数生效", () => {
    // 当前 zh 缺某 key 时回退到 en
    const d: Dictionaries = {
      zh: { a: "甲" },
      en: { a: "A", b: "B-en" },
    };
    expect(translate(d, "zh", "b", undefined, "en")).toBe("B-en");
  });

  it("空串文案:命中空字符串应原样返回空串,而非误判为缺失", () => {
    const d: Dictionaries = { zh: { empty: "" }, en: { empty: "fallback" } };
    expect(translate(d, "zh", "empty")).toBe("");
  });
});

describe("detectLang", () => {
  it("用户偏好存在时优先用偏好(且校验合法)", () => {
    expect(detectLang({ stored: "en", navigator: "zh-CN" })).toBe("en");
    expect(detectLang({ stored: "zh", navigator: "en-US" })).toBe("zh");
  });

  it("偏好非法时忽略,落到 navigator 判定", () => {
    expect(detectLang({ stored: "xx", navigator: "en-US" })).toBe("en");
  });

  it("无偏好:navigator zh* -> zh", () => {
    expect(detectLang({ stored: null, navigator: "zh-CN" })).toBe("zh");
    expect(detectLang({ stored: null, navigator: "zh" })).toBe("zh");
    expect(detectLang({ stored: null, navigator: "zh-TW" })).toBe("zh");
  });

  it("无偏好:navigator 非 zh -> en", () => {
    expect(detectLang({ stored: null, navigator: "en-US" })).toBe("en");
    expect(detectLang({ stored: null, navigator: "fr-FR" })).toBe("en");
  });

  it("navigator 也缺失时退到 en", () => {
    expect(detectLang({ stored: null, navigator: undefined })).toBe("en");
    expect(detectLang({ stored: null, navigator: "" })).toBe("en");
  });

  it("大小写不敏感:ZH-cn -> zh", () => {
    expect(detectLang({ stored: null, navigator: "ZH-cn" })).toBe("zh");
  });
});

// 类型层面的健全性:Lang 仅 "zh" | "en"
const _lang: Lang = "zh";
void _lang;
