// UX-17: 在线/离线 + 后端可达性的纯状态机。
//
// 把「浏览器是否联网」与「后端健康检查是否通过」两路信号合并成一个可测的状态,
// 并派生出要展示哪条横幅。组件只负责订阅事件并把它们 dispatch 进来。

export type BackendStatus = "unknown" | "reachable" | "unreachable";

export interface ConnectivityState {
  /** navigator.onLine / online、offline 事件反映的浏览器联网状态。 */
  online: boolean;
  /** 后端健康检查(/auth/status 等)的可达性。 */
  backend: BackendStatus;
}

export type ConnectivityAction =
  | { type: "online" }
  | { type: "offline" }
  | { type: "backend_ok" }
  | { type: "backend_error" };

export function initialConnectivity(online: boolean): ConnectivityState {
  return { online, backend: "unknown" };
}

export function connectivityReducer(
  state: ConnectivityState,
  action: ConnectivityAction,
): ConnectivityState {
  switch (action.type) {
    case "online":
      return { ...state, online: true };
    case "offline":
      return { ...state, online: false };
    case "backend_ok":
      return { ...state, backend: "reachable" };
    case "backend_error":
      return { ...state, backend: "unreachable" };
    default:
      return state;
  }
}

export type BannerKind = "offline" | "backend";

export interface BannerInfo {
  kind: BannerKind;
  message: string;
}

/**
 * 根据状态派生应显示的横幅(优先级:离线 > 后端不可达 > 无)。
 * - 浏览器离线时,无论后端如何都判离线(此时请求必然失败)。
 * - backend 为 "unknown"(尚未探测)时不显示后端横幅,避免冷启动闪一下。
 */
export function selectBanner(state: ConnectivityState): BannerInfo | null {
  if (!state.online) {
    return { kind: "offline", message: "网络已断开，正在等待恢复…" };
  }
  if (state.backend === "unreachable") {
    return { kind: "backend", message: "无法连接服务器，部分功能不可用" };
  }
  return null;
}
