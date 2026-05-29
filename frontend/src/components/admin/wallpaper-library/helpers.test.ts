import { describe, it, expect } from "vitest";
import {
  extractKeyFromUrl,
  stripKeyFromUrl,
  injectKeyIntoUrl,
  formatBytes,
  formatDate,
  siteOriginHref,
} from "./helpers";

describe("extractKeyFromUrl", () => {
  it("读取指定查询参数的值", () => {
    expect(
      extractKeyFromUrl(
        "https://api.example.com/s?client_id=abc123",
        "client_id",
      ),
    ).toBe("abc123");
  });

  it("参数不存在时返回空串", () => {
    expect(extractKeyFromUrl("https://api.example.com/s", "client_id")).toBe(
      "",
    );
  });

  it("URL 无法解析时返回空串", () => {
    expect(extractKeyFromUrl("not a url", "client_id")).toBe("");
  });

  it("对参数值做 URL 解码", () => {
    expect(extractKeyFromUrl("https://x.com/?key=a%20b%26c", "key")).toBe(
      "a b&c",
    );
  });
});

describe("stripKeyFromUrl", () => {
  it("移除指定查询参数", () => {
    expect(
      stripKeyFromUrl(
        "https://api.example.com/s?client_id=abc&q=cat",
        "client_id",
      ),
    ).toBe("https://api.example.com/s?q=cat");
  });

  it("参数不存在时保持其余 URL 不变", () => {
    expect(
      stripKeyFromUrl("https://api.example.com/s?q=cat", "client_id"),
    ).toBe("https://api.example.com/s?q=cat");
  });

  it("URL 无法解析时原样返回", () => {
    expect(stripKeyFromUrl("not a url", "client_id")).toBe("not a url");
  });
});

describe("injectKeyIntoUrl", () => {
  it("把 key 写入已存在的查询参数（覆盖）", () => {
    expect(injectKeyIntoUrl("https://x.com/?apikey=old", "apikey", "new")).toBe(
      "https://x.com/?apikey=new",
    );
  });

  it("把 key 追加为新的查询参数", () => {
    expect(injectKeyIntoUrl("https://x.com/s?q=cat", "apikey", "k1")).toBe(
      "https://x.com/s?q=cat&apikey=k1",
    );
  });

  it("空白 key 不修改 URL", () => {
    expect(injectKeyIntoUrl("https://x.com/s?q=cat", "apikey", "   ")).toBe(
      "https://x.com/s?q=cat",
    );
  });

  it("注入前对 key 做 trim", () => {
    expect(injectKeyIntoUrl("https://x.com/", "apikey", "  k1  ")).toBe(
      "https://x.com/?apikey=k1",
    );
  });

  it("无法解析的 URL：用 ? 分隔符回退拼接", () => {
    expect(injectKeyIntoUrl("weird", "apikey", "k1")).toBe("weird?apikey=k1");
  });

  it("无法解析但含 ? 的 URL：用 & 分隔符回退拼接并编码", () => {
    expect(injectKeyIntoUrl("weird?x", "apikey", "a b")).toBe(
      "weird?x&apikey=a%20b",
    );
  });
});

describe("formatBytes", () => {
  it("空值/非正数返回破折号", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
  });

  it("小于 1KB 显示字节", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("小于 1MB 显示 KB（1 位小数）", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("大于等于 1MB 显示 MB（2 位小数）", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

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
    expect(siteOriginHref("https://api.example.com/search?q=cat&n=8")).toBe(
      "https://api.example.com",
    );
  });

  it("无法解析时原样返回", () => {
    expect(siteOriginHref("not a url")).toBe("not a url");
  });
});
