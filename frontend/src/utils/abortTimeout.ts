/**
 * FE-1: 为 fetch 增加超时与可取消能力。
 *
 * `request` 之前直接 `await fetch(...)`,没有任何超时/取消机制 —— 后端挂起时
 * 整个 UI 会无限等待。这里提供一个纯函数,把"超时自动 abort"的信号与调用方
 * 传入的外部信号(如组件卸载时的 AbortController)合并成单个 signal。
 *
 * 返回:
 *  - signal:   传给 fetch 的合并信号(超时或外部任一触发即 abort)
 *  - cleanup:  请求结束后必须调用,清掉定时器并解绑监听,避免泄漏
 *  - didTimeout(): 是否因超时而 abort(用于把错误归一化为干净的超时错误)
 */
export interface TimeoutSignal {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function withTimeoutSignal(
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  external?: AbortSignal | null,
): TimeoutSignal {
  const controller = new AbortController();
  let timedOut = false;

  // 外部信号已经处于 abort 状态:直接透传中止,无需起定时器。
  if (external?.aborted) {
    controller.abort(external.reason);
  }

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external && !external.aborted) {
    external.addEventListener("abort", onExternalAbort);
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", onExternalAbort);
  };

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut,
  };
}
