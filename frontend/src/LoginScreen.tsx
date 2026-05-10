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
  const bothEnabled = status.ssoEnabled && status.passwordEnabled;
  const appName = status.appName || "NavHub";

  return (
    <div
      className="nh-login-overlay"
      onClick={onClose ? (e) => {
        if (e.target === e.currentTarget) onClose();
      } : undefined}
    >
      <div className="nh-login-card">
        {onClose ? (
          <button
            type="button"
            className="nh-login-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        ) : null}

        <div className="nh-login-head">
          <img className="nh-login-icon" src="/navigation.png" alt="" />
          <div className="nh-login-title">{appName}</div>
        </div>

        {bothDisabled ? (
          <p className="nh-login-hint">当前未启用任何登录方式，请联系管理员。</p>
        ) : mode === "sso" && status.ssoEnabled ? (
          <div className="nh-login-pane">
            <button
              className="nh-login-btn"
              onClick={onSsoLogin}
              disabled={pending}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              使用 Casdoor 登录
            </button>
            {bothEnabled ? (
              <button
                type="button"
                className="nh-login-switch"
                onClick={() => { setErr(null); setMode("password"); }}
              >
                使用账号密码登录
              </button>
            ) : null}
          </div>
        ) : mode === "password" && status.passwordEnabled ? (
          <div className="nh-login-pane">
            <label className="nh-login-field">
              <svg className="nh-login-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                className="nh-login-input"
                placeholder="用户名或邮箱"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                autoComplete="username"
              />
            </label>
            <label className="nh-login-field">
              <svg className="nh-login-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
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
            </label>
            <button
              className="nh-login-btn"
              onClick={() => void onPasswordLogin()}
              disabled={pending || !username || !password}
            >
              {pending ? "登录中…" : "登录"}
            </button>
            {err ? <div className="nh-login-err">{err}</div> : null}
            {bothEnabled ? (
              <button
                type="button"
                className="nh-login-switch"
                onClick={() => { setErr(null); setMode("sso"); }}
              >
                返回 SSO 登录
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
