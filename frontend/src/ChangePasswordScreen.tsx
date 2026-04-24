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
      toast.success("密码已修改,请使用新密码重新登录");
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
      <div className="nh-login-wrap">
        <div className="nh-login-box">
          <div className="nh-login-pane">
            <div className="nh-login-title">请修改初始密码</div>
            <p className="nh-login-sub">为了安全起见,您必须修改密码才能继续使用。</p>
            <input
              className="nh-login-input"
              type="password"
              placeholder="新密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <input
              className="nh-login-input"
              type="password"
              placeholder="确认新密码"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSubmit();
              }}
            />
            <button
              type="button"
              className="nh-btn-primary"
              onClick={() => void onSubmit()}
              disabled={pending || !password || !confirm}
            >
              {pending ? "提交中…" : "确认修改"}
            </button>
            {err && <div className="nh-login-err">{err}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
