import { useCallback, useEffect, useReducer, useState } from "react";
import { api, ApiError } from "./api";
import type { AuthStatus, Me, Workspace } from "./types";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { Toaster } from "sonner";

import { ChangePasswordScreen } from "./ChangePasswordScreen";
import { mergeGuestTweaks } from "./utils/guestTweaks";
import {
  connectivityReducer,
  initialConnectivity,
  selectBanner,
} from "./utils/connectivity";

interface ReadyState {
  stage: "ready";
  status: AuthStatus | null;
  me: Me | null;
  workspace: Workspace;
  /** True while the first /workspace request is still in flight on a cold start. */
  revalidating?: boolean;
}

type BootState =
  | { stage: "error"; message: string }
  | { stage: "must_change_password" }
  | ReadyState;

const SWR_KEY = "navhub_swr_v1";

interface SwrPayload {
  status: AuthStatus;
  me: Me | null;
  workspace: Workspace;
}

function readSwr(): SwrPayload | null {
  try {
    const raw = window.localStorage.getItem(SWR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Sanity check the shape so a corrupted entry doesn't crash boot.
    if (
      parsed &&
      parsed.workspace &&
      Array.isArray(parsed.workspace.groups) &&
      Array.isArray(parsed.workspace.icons) &&
      Array.isArray(parsed.workspace.widgets) &&
      parsed.status
    ) {
      return parsed as SwrPayload;
    }
  } catch (_e) {
    /* ignore */
  }
  return null;
}

function writeSwr(payload: SwrPayload) {
  try {
    window.localStorage.setItem(SWR_KEY, JSON.stringify(payload));
  } catch (_e) {
    /* quota exceeded — fine, just skip caching */
  }
}

function clearSwr() {
  try {
    window.localStorage.removeItem(SWR_KEY);
  } catch (_e) {
    /* ignore */
  }
}

// An empty workspace lets the Shell render immediately on a cold first visit
// instead of blocking on a full-screen loading screen. Real data slides in
// when /workspace returns.
function emptyWorkspace(): Workspace {
  return {
    groups: [],
    icons: [],
    widgets: [],
    preferences: {
      tweaks: {},
      customEngines: [],
      pushedGroupWallpapers: {},
      sidebarOrder: [],
    },
    iframeWhitelist: [],
    guest: true,
  };
}

export function App() {
  // Always start in "ready" so the Shell mounts on the first frame.
  // - If we have an SWR snapshot, paint it immediately (best UX on repeat visits).
  // - Otherwise, paint the empty skeleton — the Shell handles zero groups/icons
  //   gracefully, and the real data replaces it as soon as /workspace returns.
  const [state, setState] = useState<BootState>(() => {
    const cached = readSwr();
    if (cached) {
      return {
        stage: "ready",
        status: cached.status,
        me: cached.me,
        workspace: cached.workspace,
        revalidating: true,
      };
    }
    return {
      stage: "ready",
      status: null,
      me: null,
      workspace: emptyWorkspace(),
      revalidating: true,
    };
  });
  const [wantLogin, setWantLogin] = useState(false);

  // UX-17: 在线/离线 + 后端可达性。监听 navigator 的 online/offline 事件,
  // 并在 boot 成功/失败时反映后端健康,据此渲染全局横幅。
  const [conn, dispatchConn] = useReducer(
    connectivityReducer,
    typeof navigator !== "undefined" ? navigator.onLine : true,
    initialConnectivity,
  );
  useEffect(() => {
    const onOnline = () => {
      dispatchConn({ type: "online" });
      void boot(); // 网络恢复时自动重连一次
    };
    const onOffline = () => dispatchConn({ type: "offline" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boot = useCallback(async () => {
    try {
      // Status + workspace always go in parallel. /api/me only fires if we
      // believe the user is logged in:
      //   - If the SWR cache says they were authed, kick it off optimistically
      //     to keep the "warm cache, three-in-flight" fast path.
      //   - Otherwise (cold start, incognito, last-known guest) we wait for
      //     /auth/status — saves a guaranteed 401 round-trip for every guest.
      const cachedAuthed = readSwr()?.status?.authenticated === true;
      const meEager = cachedAuthed
        ? api.me().catch((e) => {
            if (e instanceof ApiError && e.status === 401) return null;
            throw e;
          })
        : null;

      const [statusResult, workspaceResult] = await Promise.all([
        api.status(),
        api.workspace(),
      ]);

      if (statusResult.mustChangePassword) {
        setState({ stage: "must_change_password" });
        clearSwr();
        return;
      }

      let meSettled: Me | null = null;
      if (statusResult.authenticated) {
        meSettled = await (meEager ??
          api.me().catch((e) => {
            if (e instanceof ApiError && e.status === 401) return null;
            throw e;
          }));
      }

      let workspace = workspaceResult;
      const me = statusResult.authenticated ? meSettled : null;
      if (!me) {
        try {
          const guestStr = window.localStorage.getItem("navhub_guest_tweaks");
          if (guestStr) {
            const guestTweaks = JSON.parse(guestStr);
            // FE-4: 不可变合并,避免原地修改 api.workspace() 返回的(可能被
            // SWR 缓存共享的)对象,导致 React 漏更新或共享引用被污染。
            workspace = mergeGuestTweaks(workspace, guestTweaks);
          }
        } catch (_e) {
          /* ignore */
        }
      }

      if (statusResult.appName) {
        document.title = statusResult.appName;
        window.appName = statusResult.appName;
      }
      setState({ stage: "ready", status: statusResult, me, workspace });
      writeSwr({ status: statusResult, me, workspace });
      dispatchConn({ type: "backend_ok" });
      setWantLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "must_change_password") {
        setState({ stage: "must_change_password" });
        clearSwr();
        return;
      }
      // UX-17: 后端不可达——标记后端状态,驱动横幅与冷启动连接失败界面。
      dispatchConn({ type: "backend_error" });
      // Keep whatever is on screen (cache or skeleton) — the user can still
      // navigate and mutations will surface their own toast on failure.
      setState((prev) => {
        if (prev.stage === "ready") {
          return { ...prev, revalidating: false };
        }
        return {
          stage: "error",
          message: e instanceof Error ? e.message : "加载失败",
        };
      });
      console.error("boot failed", e);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (state.stage === "error") {
    return (
      <div className="nh-boot">
        <div className="nh-boot-text">加载失败:{state.message}</div>
        <button className="nh-btn-ghost" onClick={() => void boot()}>
          重试
        </button>
      </div>
    );
  }

  if (state.stage === "must_change_password") {
    return (
      <ChangePasswordScreen
        onDone={() => {
          setWantLogin(true);
          void boot();
        }}
      />
    );
  }

  // UX-17: 冷启动且后端不可达——没有缓存可用、停止 revalidating、且工作区为空时,
  // 不再只显示一个无用的空骨架,而是给出明确的「连接失败」界面并提供重试。
  const coldStartUnreachable =
    conn.backend === "unreachable" &&
    state.status === null &&
    state.revalidating === false &&
    state.workspace.groups.length === 0;

  if (coldStartUnreachable) {
    return (
      <div className="nh-boot">
        <div className="nh-boot-text">
          {conn.online ? "无法连接服务器" : "网络已断开"}
        </div>
        <div
          className="nh-boot-text"
          style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}
        >
          {conn.online
            ? "后端暂时不可用，请稍后重试。"
            : "请检查网络连接后重试。"}
        </div>
        <button
          className="nh-btn-ghost"
          onClick={() => void boot()}
          style={{ marginTop: 14 }}
        >
          重试连接
        </button>
      </div>
    );
  }

  const showLogin = wantLogin && !state.me;
  const banner = selectBanner(conn);

  return (
    <>
      {banner && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100000,
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "#fff",
            background: banner.kind === "offline" ? "#9b2c2c" : "#b45309",
            boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <span>{banner.message}</span>
          {banner.kind === "backend" && conn.online && (
            <button
              onClick={() => void boot()}
              style={{
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "#fff",
                borderRadius: 6,
                padding: "2px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              重试
            </button>
          )}
        </div>
      )}
      <WorkspaceScreen
        key={state.me ? state.me.id : "guest"}
        me={state.me}
        workspace={state.workspace}
        onReload={boot}
        onRequestLogin={() => setWantLogin(true)}
        onLogout={async () => {
          clearSwr();
          await api.logout().catch(() => undefined);
          await boot();
        }}
      />
      {showLogin && state.status ? (
        <LoginScreen
          status={state.status}
          onAuthed={boot}
          onClose={() => setWantLogin(false)}
        />
      ) : null}
      <Toaster position="top-center" richColors />
    </>
  );
}
