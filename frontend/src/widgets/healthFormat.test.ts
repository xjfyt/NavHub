import { describe, expect, it } from "vitest";
import { formatLatencyMs, formatLastOk } from "./healthFormat";

describe("formatLatencyMs", () => {
  it("毫秒与秒", () => {
    expect(formatLatencyMs(12)).toBe("12 ms");
    expect(formatLatencyMs(128.4)).toBe("128 ms");
    expect(formatLatencyMs(1500)).toBe("1.5 s");
  });
  it("非法值", () => {
    expect(formatLatencyMs(-1)).toBe("—");
    expect(formatLatencyMs(Number.NaN)).toBe("—");
  });
});

describe("formatLastOk", () => {
  const now = 1_700_000_000_000;
  it("刚刚 / 秒前 / 分钟前", () => {
    expect(formatLastOk(now - 3000, now)).toBe("刚刚");
    expect(formatLastOk(now - 20_000, now)).toBe("20 秒前");
    expect(formatLastOk(now - 5 * 60_000, now)).toBe("5 分钟前");
  });
});
