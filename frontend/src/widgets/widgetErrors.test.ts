import { describe, expect, it } from "vitest";
import {
  friendlyUiError,
  friendlyWidgetError,
  isUnauthorizedError,
} from "./widgetErrors";

describe("widgetErrors", () => {
  it("识别 401", () => {
    expect(isUnauthorizedError({ status: 401, message: "unauthorized" })).toBe(
      true,
    );
    expect(isUnauthorizedError({ message: "timeout" })).toBe(false);
  });
  it("访客不展示 ERROR/unauthorized", () => {
    expect(
      friendlyWidgetError({ status: 401, message: "unauthorized" }, true),
    ).toBe("登录后查看");
    expect(friendlyWidgetError({ message: "boom" }, false)).toBe("暂无数据");
  });
  it("表单错误不把英文 ERROR 甩给用户", () => {
    expect(friendlyUiError({ message: "unauthorized" }, "保存失败")).toBe(
      "登录已过期，请重新登录",
    );
    expect(friendlyUiError(new Error("Bad Request"), "保存失败")).toBe(
      "保存失败",
    );
    expect(friendlyUiError(new Error("添加图标失败"), "保存失败")).toBe(
      "添加图标失败",
    );
  });
});
