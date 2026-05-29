import { describe, it, expect } from "vitest";
import {
  mouseActivationConstraint,
  touchActivationConstraint,
} from "./dndSensors";

describe("dnd 传感器激活约束", () => {
  it("鼠标:保持小位移即可拖动(与原 PointerSensor distance:4 一致)", () => {
    expect(mouseActivationConstraint).toEqual({ distance: 4 });
  });

  it("触摸:长按延迟在 200–250ms 区间,避免轻点/滑动误触发拖拽", () => {
    expect(touchActivationConstraint.delay).toBeGreaterThanOrEqual(200);
    expect(touchActivationConstraint.delay).toBeLessThanOrEqual(250);
  });

  it("触摸:容差较小(<=10px),长按期间轻微抖动仍算长按而非取消", () => {
    expect(touchActivationConstraint.tolerance).toBeGreaterThan(0);
    expect(touchActivationConstraint.tolerance).toBeLessThanOrEqual(10);
  });
});
