import { describe, it, expect } from "vitest";
import {
  formatDate,
  siteOriginHref,
  remoteIconSrc,
  storageKeyFromUpload,
  titleFromFileName,
} from "./helpers";

describe("formatDate", () => {
  it("空值返回「从未」", () => {
    expect(formatDate(null)).toBe("从未");
  });

  it("有效 ISO 时间返回 zh-CN 月/日/时/分格式（非「从未」）", () => {
    const out = formatDate("2024-03-05T08:09:00Z");
    expect(out).not.toBe("从未");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("siteOriginHref", () => {
  it("返回 protocol//hostname（去掉路径与查询）", () => {
    expect(siteOriginHref("https://icon-sets.iconify.design/logos/?x=1")).toBe(
      "https://icon-sets.iconify.design",
    );
  });

  it("无法解析时原样返回", () => {
    expect(siteOriginHref("not a url")).toBe("not a url");
  });
});

describe("remoteIconSrc", () => {
  it("有 storageKey 时使用 /uploads/ 路径", () => {
    expect(
      remoteIconSrc({ storageKey: "abc.svg", originalUrl: "https://x/o.svg" }),
    ).toBe("/uploads/abc.svg");
  });

  it("无 storageKey 时退回原始 URL", () => {
    expect(
      remoteIconSrc({ storageKey: null, originalUrl: "https://x/o.svg" }),
    ).toBe("https://x/o.svg");
  });
});

describe("storageKeyFromUpload", () => {
  it("优先使用接口返回的 filename", () => {
    expect(
      storageKeyFromUpload({
        filename: "stored.svg",
        url: "/uploads/whatever.svg",
      }),
    ).toBe("stored.svg");
  });

  it("无 filename 时从 url 解析 /uploads/ 之后的文件名（并去掉查询串）", () => {
    expect(
      storageKeyFromUpload({ url: "https://host/uploads/icon.png?token=1" }),
    ).toBe("icon.png");
  });

  it("filename 为 null 时回退到 url 解析", () => {
    expect(
      storageKeyFromUpload({ filename: null, url: "/uploads/k.svg" }),
    ).toBe("k.svg");
  });

  it("既无 filename 也无 /uploads/ 段时返回 url 末段", () => {
    expect(storageKeyFromUpload({ url: "plain" })).toBe("plain");
  });
});

describe("titleFromFileName", () => {
  it("去掉扩展名", () => {
    expect(titleFromFileName("github.svg")).toBe("github");
  });

  it("去掉最后一个扩展名（保留中间的点）", () => {
    expect(titleFromFileName("my.icon.png")).toBe("my.icon");
  });

  it("无扩展名时原样返回", () => {
    expect(titleFromFileName("noext")).toBe("noext");
  });
});
