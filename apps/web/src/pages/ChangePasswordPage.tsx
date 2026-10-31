import { PageBackLink } from "../components/PageBackLink";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, getCurrentSession } from "../lib/authClient";
import { useAuth } from "../lib/authContext";
export function ChangePasswordPage() {
  const { session, signOut } = useAuth(); const navigate = useNavigate();
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if ([...password].length < 8 || [...password].length > 128) { setError("密码长度须为 8 至 128 个字符。"); return; }
    if (password !== confirm) { setError("两次输入的新密码不一致。"); return; }
    setBusy(true);
    try { if (await changePassword(current, password) && !getCurrentSession()) navigate("/login?passwordChanged=1", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? `${reason.message} 若上次操作已成功，请使用新密码重新登录。` : "密码修改未完成，请重试或重新登录。"); }
    finally { setCurrent(""); setPassword(""); setConfirm(""); setBusy(false); }
  }
  return <main className="login-page"><section className="login-panel">{!session?.mustChangePassword && <PageBackLink to="/settings" label="设置" />}<h1>修改登录密码</h1>
    <p className="login-note">{session?.mustChangePassword ? "请先修改临时密码，再访问账本。" : "修改成功后，所有设备需要重新登录。"}</p>
    <form className="login-form" onSubmit={submit}>
      <label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required disabled={busy}/></label>
      <label>新密码<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label>
      <label>确认新密码<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required disabled={busy}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}<button disabled={busy}>{busy ? "修改中..." : "修改密码"}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => { void signOut().then(changed => { if (changed && !getCurrentSession()) navigate("/login", {replace:true}); }).catch(() => { if (!getCurrentSession()) navigate("/login?logoutUnconfirmed=1", {replace:true}); }); }}>退出登录</button>

    </form></section></main>;
}
