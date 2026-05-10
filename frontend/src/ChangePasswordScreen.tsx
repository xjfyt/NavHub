import { useState } from "react";
import { toast } from "sonner";
import { api } from "./api";

export function ChangePasswordScreen(props: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (password !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setErr("密码至少 6 位");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await api.changePassword(password);
      toast.success("密码已修改，请使用新密码重新登录");
      props.onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "修改失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="nh-bg bg-night" />
      <div className="nh-login-overlay">
        <div className="nh-login-card">
          <div className="nh-login-head">
            <div className="nh-login-icon-glyph">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div className="nh-login-title">请修改初始密码</div>
            <p className="nh-login-caption">为了账号安全，首次登录需要重置密码</p>
          </div>

          <div className="nh-login-pane">
            <label className="nh-login-field">
              <svg className="nh-login-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <input
                className="nh-login-input"
                type="password"
                placeholder="新密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="nh-login-field">
              <svg className="nh-login-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <input
                className="nh-login-input"
                type="password"
                placeholder="再次确认新密码"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSubmit();
                }}
              />
            </label>
            <button
              type="button"
              className="nh-login-btn"
              onClick={() => void onSubmit()}
              disabled={pending || !password || !confirm}
            >
              {pending ? "提交中…" : "确认修改"}
            </button>
            {err ? <div className="nh-login-err">{err}</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}
