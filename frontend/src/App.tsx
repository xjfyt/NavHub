import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { AuthStatus, Me, Workspace } from "./types";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { Toaster } from "sonner";

import { ChangePasswordScreen } from "./ChangePasswordScreen";

interface ReadyState {
  stage: "ready";
  status: AuthStatus;
  me: Me | null;
  workspace: Workspace;
  /** True while a background revalidation is in flight after a stale render. */
  revalidating?: boolean;
}

type BootState =
  | { stage: "loading" }
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

export function App() {
  // Seed from the last known good payload so the UI paints immediately on
  // repeat visits even before /workspace returns. The `revalidating` flag
  // marks the brief window where the screen is showing stale data.
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
    return { stage: "loading" };
  });
  const [wantLogin, setWantLogin] = useState(false);

  const boot = useCallback(async () => {
    try {
      const status = await api.status();
      if (status.mustChangePassword) {
        setState({ stage: "must_change_password" });
        clearSwr();
        return;
      }
      const [workspace, meResult] = await Promise.all([
        api.workspace(),
        api.me().catch((e) => {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }),
      ]);
      const me = status.authenticated ? meResult : null;
      if (!me) {
        try {
          const guestStr = window.localStorage.getItem("navhub_guest_tweaks");
          if (guestStr) {
            const guestTweaks = JSON.parse(guestStr);
            workspace.preferences.tweaks = { ...workspace.preferences.tweaks, ...guestTweaks };
          }
        } catch (_e) {
          /* ignore */
        }
      }

      if (status.appName) {
        document.title = status.appName;
        (window as any).appName = status.appName;
      }
      setState({ stage: "ready", status, me, workspace });
      writeSwr({ status, me, workspace });
      setWantLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "must_change_password") {
        setState({ stage: "must_change_password" });
        clearSwr();
        return;
      }
      // If we already painted from cache, keep that on screen rather than
      // dropping the user back to a generic error page — they can still
      // navigate, mutations will surface their own toast on failure.
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

  if (state.stage === "loading") {
    return (
      <div className="nh-boot">
        <div className="nh-boot-spinner" />
        <div className="nh-boot-text">正在加载系统环境 …</div>
      </div>
    );
  }

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
      {showLogin ? (
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
