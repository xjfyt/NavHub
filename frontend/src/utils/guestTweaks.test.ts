import { describe, it, expect } from "vitest";
import { mergeGuestTweaks } from "./guestTweaks";
import type { Workspace } from "../types";

function makeWorkspace(): Workspace {
  return {
    groups: [],
    icons: [],
    widgets: [],
    preferences: {
      tweaks: { theme: "dark", glass: 10 },
      customEngines: [],
      pushedGroupWallpapers: {},
      sidebarOrder: [],
    },
    iframeWhitelist: [],
    guest: true,
  };
}

describe("mergeGuestTweaks", () => {
  it("把访客 tweaks 合并进结果", () => {
    const ws = makeWorkspace();
    const merged = mergeGuestTweaks(ws, { theme: "light", gridCols: 6 });
    expect(merged.preferences.tweaks).toEqual({
      theme: "light",
      glass: 10,
      gridCols: 6,
    });
  });

  it("不修改原始入参(无副作用)", () => {
    const ws = makeWorkspace();
    const snapshot = JSON.parse(JSON.stringify(ws));
    mergeGuestTweaks(ws, { theme: "light", gridCols: 6 });
    expect(ws).toEqual(snapshot);
    // 顶层与嵌套对象均应为新引用,而非原地修改
  });

  it("返回的 workspace / preferences / tweaks 均为新引用", () => {
    const ws = makeWorkspace();
    const merged = mergeGuestTweaks(ws, { theme: "light" });
    expect(merged).not.toBe(ws);
    expect(merged.preferences).not.toBe(ws.preferences);
    expect(merged.preferences.tweaks).not.toBe(ws.preferences.tweaks);
  });

  it("空 tweaks 时保留原值", () => {
    const ws = makeWorkspace();
    const merged = mergeGuestTweaks(ws, {});
    expect(merged.preferences.tweaks).toEqual({ theme: "dark", glass: 10 });
  });
});
