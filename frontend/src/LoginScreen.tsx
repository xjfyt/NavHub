import { useState } from "react";
import { api, ApiError } from "./api";
import type { AuthStatus } from "./types";
import {
  shouldShowDefaultCredsHint,
  readDefaultCredsHintDismissed,
  persistDefaultCredsHintDismissed,
} from "./utils/firstRun";
import { useI18n } from "./i18n";

export function LoginScreen(props: {
  status: AuthStatus;
  onAuthed: () => void;
  onClose?: () => void;
}) {
  const { status, onAuthed, onClose } = props;
  const { t } = useI18n();
  const initialMode: "sso" | "password" = status.ssoEnabled
    ? "sso"
    : "password";
  const [mode, setMode] = useState<"sso" | "password">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 本次会话内的登录尝试次数 + 用户是否关闭过首次使用提示。
  const [attemptCount, setAttemptCount] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(() =>
    readDefaultCredsHintDismissed(),
  );

  const onSsoLogin = () => {
    window.location.href = api.loginUrl();
  };

  const onPasswordLogin = async () => {
    setPending(true);
    setErr(null);
    setAttemptCount((n) => n + 1);
    try {
      await api.passwordLogin(username, password);
      onAuthed();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.code === "sso_required"
            ? t("login.err.ssoRequired")
            : e.code === "password_login_disabled"
              ? t("login.err.passwordDisabled")
              : t("login.err.badCredentials")
          : t("login.err.generic");
      setErr(msg);
    } finally {
      setPending(false);
    }
  };

  const bothDisabled = !status.ssoEnabled && !status.passwordEnabled;
  const bothEnabled = status.ssoEnabled && status.passwordEnabled;
  const appName = status.appName || "NavHub";

  const showDefaultCredsHint =
    mode === "password" &&
    shouldShowDefaultCredsHint({
      passwordEnabled: status.passwordEnabled,
      attemptCount,
      dismissed: hintDismissed,
    });
  const onDismissHint = () => {
    persistDefaultCredsHintDismissed();
    setHintDismissed(true);
  };

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
            aria-label={t("common.close")}
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
          <p className="nh-login-hint">{t("login.bothDisabled")}</p>
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
              {t("login.sso")}
            </button>
            {bothEnabled ? (
              <button
                type="button"
                className="nh-login-switch"
                onClick={() => { setErr(null); setMode("password"); }}
              >
                {t("login.switchToPassword")}
              </button>
            ) : null}
          </div>
        ) : mode === "password" && status.passwordEnabled ? (
          <div className="nh-login-pane">
            {showDefaultCredsHint ? (
              <div className="nh-login-firstrun" role="note">
                <span
                  className="nh-login-firstrun-text"
                  // 静态模板,内含 <b> 强调;无任何用户输入拼接,故安全直渲。
                  dangerouslySetInnerHTML={{ __html: t("login.firstRunHintHtml") }}
                />
                <button
                  type="button"
                  className="nh-login-firstrun-close"
                  aria-label={t("login.dismissHint")}
                  onClick={onDismissHint}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
            ) : null}
            <label className="nh-login-field">
              <svg className="nh-login-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                className="nh-login-input"
                placeholder={t("login.usernamePlaceholder")}
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
                placeholder={t("login.passwordPlaceholder")}
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
              {pending ? t("login.submitting") : t("login.submit")}
            </button>
            {err ? <div className="nh-login-err">{err}</div> : null}
            {bothEnabled ? (
              <button
                type="button"
                className="nh-login-switch"
                onClick={() => { setErr(null); setMode("sso"); }}
              >
                {t("login.switchToSso")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
