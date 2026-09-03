import { describe, expect, it } from "vitest";
import { friendlyWidgetError, isUnauthorizedError } from "./widgetErrors";

describe("widgetErrors", () => {
  it("识别 401", () => {
    expect(isUnauthorizedError({ status: 401, message: "unauthorized" })).toBe(
      true,
    );
    expect(isUnauthorizedError({ message: "timeout" })).toBe(false);
  });
  it("访客不展示 ERROR/unauthorized", () => {
    expect(friendlyWidgetError({ status: 401, message: "unauthorized" }, true)).toBe(
      "登录后查看",
    );
    expect(friendlyWidgetError({ message: "boom" }, false)).toBe("暂无数据");
  });
});
