import { describe, it, expect } from "vitest";
import { shouldShowDefaultCredsHint } from "./firstRun";

describe("shouldShowDefaultCredsHint", () => {
  it("首次进入(密码登录开启 / 零次尝试 / 未被关闭)时显示", () => {
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: true,
        attemptCount: 0,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it("密码登录被关闭时不显示(默认凭据是密码登录,关掉就无意义)", () => {
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: false,
        attemptCount: 0,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("用户已手动关闭后不再显示", () => {
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: true,
        attemptCount: 0,
        dismissed: true,
      }),
    ).toBe(false);
  });

  it("已经尝试过登录后不显示——避免向已配置实例暗示默认凭据仍然有效", () => {
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: true,
        attemptCount: 1,
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: true,
        attemptCount: 5,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("负数 / 异常 attemptCount 按非首次处理(保守不泄露)", () => {
    expect(
      shouldShowDefaultCredsHint({
        passwordEnabled: true,
        attemptCount: -1,
        dismissed: false,
      }),
    ).toBe(false);
  });
});
