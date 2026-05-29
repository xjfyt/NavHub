import { describe, it, expect } from "vitest";
import { summarizeBatch, formatBatchSummary } from "./batchResult";

describe("summarizeBatch", () => {
  it("统计成功/失败数量", () => {
    const results = [
      { ok: true },
      { ok: false, error: "boom" },
      { ok: true },
    ];
    const s = summarizeBatch(results);
    expect(s.ok).toBe(2);
    expect(s.fail).toBe(1);
    expect(s.total).toBe(3);
  });

  it("空输入返回全 0", () => {
    const s = summarizeBatch([]);
    expect(s).toEqual({ ok: 0, fail: 0, total: 0, errors: [] });
  });

  it("收集失败原因(去重保序)", () => {
    const s = summarizeBatch([
      { ok: false, error: "网络错误" },
      { ok: false, error: "网络错误" },
      { ok: false, error: "格式不支持" },
      { ok: true },
    ]);
    expect(s.errors).toEqual(["网络错误", "格式不支持"]);
  });

  it("失败但无 error 文案时不进入 errors", () => {
    const s = summarizeBatch([{ ok: false }, { ok: false, error: "" }]);
    expect(s.fail).toBe(2);
    expect(s.errors).toEqual([]);
  });
});

describe("formatBatchSummary", () => {
  it("全部成功:成功 X", () => {
    expect(formatBatchSummary({ ok: 3, fail: 0, total: 3, errors: [] })).toBe("成功 3");
  });

  it("全部失败:失败 Y", () => {
    expect(formatBatchSummary({ ok: 0, fail: 2, total: 2, errors: [] })).toBe("失败 2");
  });

  it("混合:成功 X，失败 Y", () => {
    expect(formatBatchSummary({ ok: 2, fail: 1, total: 3, errors: [] })).toBe("成功 2，失败 1");
  });

  it("空批次返回空字符串", () => {
    expect(formatBatchSummary({ ok: 0, fail: 0, total: 0, errors: [] })).toBe("");
  });

  it("可覆盖名词单位(如「张」)", () => {
    expect(formatBatchSummary({ ok: 2, fail: 1, total: 3, errors: [] }, "张")).toBe(
      "成功 2 张，失败 1 张",
    );
  });
});
