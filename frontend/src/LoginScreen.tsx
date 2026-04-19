import { useState } from "react";
import { api, ApiError } from "./api";
import type { AuthStatus } from "./types";

export function LoginScreen(props: {
  status: AuthStatus;
  onAuthed: () => void;
  onClose?: () => void;
}) {
  const { status, onAuthed, onClose } = props;
  const initialMode: "sso" | "password" = status.ssoEnabled
    ? "sso"
    : "password";
  const [mode, setMode] = useState<"sso" | "password">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSsoLogin = () => {
    window.location.href = api.loginUrl();
  };

  const onPasswordLogin = async () => {
    setPending(true);
    setErr(null);
    try {
      await api.passwordLogin(username, password);
      onAuthed();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.code === "sso_required"
            ? "该账号仅支持 SSO 登录"
            : e.code === "password_login_disabled"
              ? "管理员已关闭密码登录"
              : "账号或密码错误"
          : "登录失败";
      setErr(msg);
    } finally {
      setPending(false);
    }
  };

  const bothDisabled = !status.ssoEnabled && !status.passwordEnabled;

  return (
    <>
      <div className="nh-bg bg-night" />
      <div className="nh-login-wrap">
        <div className="nh-login-card nh-card">
          {onClose ? (
            <button
              type="button"
              className="nh-login-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
          <div className="nh-login-title">{status.appName || "NavHub"}</div>
          <div className="nh-login-sub">极简导航 · 单点登录</div>

          {bothDisabled ? (
            <div className="nh-login-pane">
              <p className="nh-login-hint">当前未启用任何登录方式,请联系管理员。</p>
            </div>
          ) : (
            <>
              <div className="nh-login-tabs">
                {status.ssoEnabled ? (
                  <button
                    className={mode === "sso" ? "nh-tab on" : "nh-tab"}
                    onClick={() => setMode("sso")}
                  >
                    Casdoor SSO
                  </button>
                ) : null}
                {status.passwordEnabled ? (
                  <button
                    className={mode === "password" ? "nh-tab on" : "nh-tab"}
                    onClick={() => setMode("password")}
                  >
                    超管密码
                  </button>
                ) : null}
              </div>

              {mode === "sso" && status.ssoEnabled ? (
                <div className="nh-login-pane">
                  <p className="nh-login-hint">
                    点击下方按钮通过 Casdoor 登录。首次登录将自动在本系统创建账号。
                  </p>
                  <button
                    className="nh-btn-primary"
                    onClick={onSsoLogin}
                    disabled={pending}
                  >
                    使用 Casdoor 登录
                  </button>
                </div>
              ) : null}

              {mode === "password" && status.passwordEnabled ? (
                <div className="nh-login-pane">
                  <p className="nh-login-hint">
                    仅超级管理员可使用账号密码登录,其它角色请使用 SSO。
                  </p>
                  <input
                    className="nh-login-input"
                    placeholder="用户名或邮箱"
                    value={username}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    autoComplete="username"
                  />
                  <input
                    className="nh-login-input"
                    placeholder="密码"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onPasswordLogin();
                    }}
                  />
                  <button
                    className="nh-btn-primary"
                    onClick={() => void onPasswordLogin()}
                    disabled={pending || !username || !password}
                  >
                    {pending ? "登录中…" : "登录"}
                  </button>
                  {err ? <div className="nh-login-err">{err}</div> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
