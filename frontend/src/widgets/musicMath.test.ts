import { describe, it, expect } from "vitest";
import {
  nextIndex,
  seekTime,
  fmtTime,
  cycleLoopMode,
  type LoopMode,
} from "./musicMath";

describe("nextIndex", () => {
  const len = 4; // 索引 0..3

  it("loop-all:向后循环回到 0,向前回到末尾", () => {
    expect(nextIndex(3, 1, len, "all")).toBe(0);
    expect(nextIndex(0, -1, len, "all")).toBe(3);
    expect(nextIndex(1, 1, len, "all")).toBe(2);
  });

  it("loop-one:手动切歌仍按顺序走(单曲循环只影响“自然结束”,不锁死手动切)", () => {
    expect(nextIndex(1, 1, len, "one")).toBe(2);
    expect(nextIndex(0, -1, len, "one")).toBe(3);
  });

  it("no-loop:到达边界返回 null(不再继续)", () => {
    expect(nextIndex(3, 1, len, "none")).toBeNull();
    expect(nextIndex(0, -1, len, "none")).toBeNull();
    expect(nextIndex(1, 1, len, "none")).toBe(2);
    expect(nextIndex(2, -1, len, "none")).toBe(1);
  });

  it("空列表返回 null", () => {
    expect(nextIndex(0, 1, 0, "all")).toBeNull();
  });

  it("找不到当前(idx<0)时,向后从 0 开始、向前到末尾", () => {
    expect(nextIndex(-1, 1, len, "all")).toBe(0);
    expect(nextIndex(-1, -1, len, "all")).toBe(3);
  });
});

describe("autoplay (自然结束时的下一首)", () => {
  // 自然结束:loop-one 应停在原地循环本曲;其余同 nextIndex。
  it("loop-one 自然结束应重播当前曲(返回原 index)", () => {
    expect(nextIndex(2, 1, 4, "one", true)).toBe(2);
  });
  it("非自然结束(手动 next)即使 loop-one 也前进", () => {
    expect(nextIndex(2, 1, 4, "one", false)).toBe(3);
  });
  it("no-loop 自然结束到末尾返回 null(停止)", () => {
    expect(nextIndex(3, 1, 4, "none", true)).toBeNull();
  });
});

describe("seekTime", () => {
  it("按点击比例换算到秒,并钳在 [0, dur]", () => {
    expect(seekTime(0.5, 200)).toBe(100);
    expect(seekTime(0, 200)).toBe(0);
    expect(seekTime(1, 200)).toBe(200);
  });
  it("越界比例被钳住", () => {
    expect(seekTime(-0.2, 200)).toBe(0);
    expect(seekTime(1.5, 200)).toBe(200);
  });
  it("时长无效返回 0", () => {
    expect(seekTime(0.5, 0)).toBe(0);
    expect(seekTime(0.5, NaN)).toBe(0);
    expect(seekTime(0.5, -10)).toBe(0);
  });
});

describe("fmtTime", () => {
  it("格式化为 mm:ss", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(5)).toBe("0:05");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(600)).toBe("10:00");
  });
  it("非法/负数回退 0:00", () => {
    expect(fmtTime(NaN)).toBe("0:00");
    expect(fmtTime(-5)).toBe("0:00");
    expect(fmtTime(Infinity)).toBe("0:00");
  });
});

describe("cycleLoopMode", () => {
  it("none → all → one → none 循环", () => {
    const seq: LoopMode[] = ["none", "all", "one", "none"];
    let m: LoopMode = "none";
    for (let i = 1; i < seq.length; i++) {
      m = cycleLoopMode(m);
      expect(m).toBe(seq[i]);
    }
  });
});
