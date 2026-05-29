// 首次运行（first-run）相关的纯逻辑助手。
//
// 背景：本应用出厂默认账号为 superadmin / superadmin，新管理员往往不知道。
// 我们希望在登录页给一条「首次使用」提示，但绝不能向一个已经配置好的实例
// 暗示「默认凭据仍然有效」——后端的 /auth/status 在未登录时并不会暴露
// must_change_password 标记，因此前端拿不到「默认凭据是否还在用」这个信号。
//
// 折中（保守）方案：提示只是泛化的「首次使用」文案，且仅在以下全部成立时显示：
//   1. 密码登录已开启（默认凭据本就是密码登录，关掉则提示毫无意义）；
//   2. 本浏览器在本次尚未发起过任何登录尝试（attemptCount === 0）——
//      一旦尝试过，就说明这台机器已经有人在用，再提示默认凭据有泄露之嫌；
//   3. 用户没有手动关闭过这条提示（dismissed === false）。
//
// 该函数不接触任何鉴权逻辑，纯输入 → 布尔输出，便于单测。

export interface DefaultCredsHintInput {
  /** /auth/status 返回的 passwordEnabled。 */
  passwordEnabled: boolean;
  /** 本次会话内已发起的登录尝试次数。 */
  attemptCount: number;
  /** 用户是否已手动关闭过该提示（持久化在 localStorage）。 */
  dismissed: boolean;
}

export function shouldShowDefaultCredsHint(input: DefaultCredsHintInput): boolean {
  if (!input.passwordEnabled) return false;
  if (input.dismissed) return false;
  // 仅在「零次尝试」时展示；负数 / NaN 等异常值一律按非首次处理（保守不泄露）。
  return input.attemptCount === 0;
}

/** localStorage key：记录用户已关闭首次使用提示。 */
export const DEFAULT_CREDS_HINT_DISMISSED_KEY = "navhub_first_run_hint_dismissed";

export function readDefaultCredsHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(DEFAULT_CREDS_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistDefaultCredsHintDismissed(): void {
  try {
    window.localStorage.setItem(DEFAULT_CREDS_HINT_DISMISSED_KEY, "1");
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
