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
}

type BootState =
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "must_change_password" }
  | ReadyState;

export function App() {
  const [state, setState] = useState<BootState>({ stage: "loading" });
  const [wantLogin, setWantLogin] = useState(false);

  const boot = useCallback(async () => {
    try {
      const [status, workspace, meResult] = await Promise.all([
        api.status(),
        api.workspace(),
        api.me().catch((e) => {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }),
      ]);
      let me = status.authenticated ? meResult : null;
      if (!me) {
        try {
          const guestStr = window.localStorage.getItem("navhub_guest_tweaks");
          if (guestStr) {
            const guestTweaks = JSON.parse(guestStr);
            workspace.preferences.tweaks = { ...workspace.preferences.tweaks, ...guestTweaks };
          }
        } catch (e) {}
      }

      if (status.appName) {
        document.title = status.appName;
        (window as any).appName = status.appName;
      }
      setState({ stage: "ready", status, me, workspace });
      setWantLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "must_change_password") {
        setState({ stage: "must_change_password" });
        return;
      }
      console.error("boot failed", e);
      setState({
        stage: "error",
        message: e instanceof Error ? e.message : "加载失败",
      });
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
    return <ChangePasswordScreen onDone={() => void boot()} />;
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
