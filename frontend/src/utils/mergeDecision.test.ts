import { describe, it, expect } from "vitest";
import {
  meetsMergeOverlap,
  shouldMergeWithTarget,
  MERGE_OVERLAP_THRESHOLD_ICON,
  MERGE_OVERLAP_THRESHOLD_FOLDER,
  MERGE_DWELL_MS,
} from "./mergeDecision";

describe("meetsMergeOverlap", () => {
  it("普通图标：擦过(低于门槛)不达标", () => {
    expect(meetsMergeOverlap(0.3, false)).toBe(false);
    expect(meetsMergeOverlap(MERGE_OVERLAP_THRESHOLD_ICON - 0.01, false)).toBe(
      false,
    );
  });

  it("普通图标：深度重叠(达到/超过门槛)达标", () => {
    expect(meetsMergeOverlap(MERGE_OVERLAP_THRESHOLD_ICON, false)).toBe(true);
    expect(meetsMergeOverlap(0.8, false)).toBe(true);
  });

  it("文件夹门槛低于普通图标，但仍需相当重叠", () => {
    expect(meetsMergeOverlap(MERGE_OVERLAP_THRESHOLD_FOLDER, true)).toBe(true);
    // 文件夹门槛下、原普通图标旧门槛(0.3)之间的重叠：文件夹不达标
    expect(meetsMergeOverlap(0.3, true)).toBe(false);
  });

  it("零 / 负 / 非有限重叠率一律不达标", () => {
    expect(meetsMergeOverlap(0, false)).toBe(false);
    expect(meetsMergeOverlap(-0.5, false)).toBe(false);
    expect(meetsMergeOverlap(NaN, true)).toBe(false);
  });
});

describe("shouldMergeWithTarget", () => {
  it("擦过：达门槛但停留不足 → 不合并", () => {
    expect(
      shouldMergeWithTarget({
        overlapRatio: 0.9,
        dwellMs: 50,
        isFolder: false,
      }),
    ).toBe(false);
  });

  it("深度重叠且停留够久 → 合并", () => {
    expect(
      shouldMergeWithTarget({
        overlapRatio: 0.9,
        dwellMs: MERGE_DWELL_MS,
        isFolder: false,
      }),
    ).toBe(true);
  });

  it("停留够久但重叠不足(只是边缘相蹭) → 不合并", () => {
    expect(
      shouldMergeWithTarget({
        overlapRatio: 0.2,
        dwellMs: 1000,
        isFolder: false,
      }),
    ).toBe(false);
  });

  it("文件夹：达文件夹门槛 + 停留够 → 合并", () => {
    expect(
      shouldMergeWithTarget({
        overlapRatio: MERGE_OVERLAP_THRESHOLD_FOLDER,
        dwellMs: MERGE_DWELL_MS + 10,
        isFolder: true,
      }),
    ).toBe(true);
  });

  it("异常 dwell(负 / NaN) → 不合并", () => {
    expect(
      shouldMergeWithTarget({
        overlapRatio: 0.9,
        dwellMs: -1,
        isFolder: false,
      }),
    ).toBe(false);
    expect(
      shouldMergeWithTarget({
        overlapRatio: 0.9,
        dwellMs: NaN,
        isFolder: false,
      }),
    ).toBe(false);
  });
});
