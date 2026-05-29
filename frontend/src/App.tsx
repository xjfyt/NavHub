import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { AuthStatus, Me, Workspace } from "./types";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { Toaster } from "sonner";

import { ChangePasswordScreen } from "./ChangePasswordScreen";
import { mergeGuestTweaks } from "./utils/guestTweaks";

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
        (window as any).appName = statusResult.appName;
      }
      setState({ stage: "ready", status: statusResult, me, workspace });
      writeSwr({ status: statusResult, me, workspace });
      setWantLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "must_change_password") {
        setState({ stage: "must_change_password" });
        clearSwr();
        return;
      }
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

  const showLogin = wantLogin && !state.me;

  return (
    <>
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
