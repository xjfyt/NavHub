import { describe, it, expect } from "vitest";
import { toBuiltinIconName, stripExt } from "./helpers";

describe("toBuiltinIconName", () => {
  it("白名单内的名称原样返回", () => {
    expect(toBuiltinIconName("home")).toBe("home");
    expect(toBuiltinIconName("settings")).toBe("settings");
  });

  it("不在白名单内的名称回退到 globe", () => {
    expect(toBuiltinIconName("not-a-real-icon")).toBe("globe");
  });

  it("null / undefined / 空串回退到 globe", () => {
    expect(toBuiltinIconName(null)).toBe("globe");
    expect(toBuiltinIconName(undefined)).toBe("globe");
    expect(toBuiltinIconName("")).toBe("globe");
  });
});

describe("stripExt", () => {
  it("去掉最后一个扩展名", () => {
    expect(stripExt("github.svg")).toBe("github");
  });

  it("仅去掉最后一个扩展名(保留中间的点)", () => {
    expect(stripExt("my.icon.png")).toBe("my.icon");
  });

  it("无扩展名时原样返回", () => {
    expect(stripExt("noext")).toBe("noext");
  });
});
