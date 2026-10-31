import { type FormEvent, useState } from "react";
import { resetUserPassword } from "../lib/authClient";
export function PasswordResetForm({ userId, email }: { userId: string; email: string }) {
  const [open,setOpen]=useState(false); const [admin,setAdmin]=useState(""); const [temporary,setTemporary]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    if ([...temporary].length < 8 || [...temporary].length > 128) { setMessage("临时密码长度须为 8 至 128 个字符。"); return; }
    setBusy(true);
    try { await resetUserPassword(userId,admin,temporary); setMessage("密码已重置，请私下告知用户临时密码，24 小时内登录并修改。"); setOpen(false); }
    catch(reason) { setMessage(reason instanceof Error ? `${reason.message} 若结果不确定，可重新重置后再告知用户。` : "重置未完成，请重试。"); }
    finally { setAdmin(""); setTemporary(""); setBusy(false); }
  }
  return <div className="password-reset-control"><button type="button" className="secondary-button" onClick={()=>{setOpen(!open);setAdmin("");setTemporary("");}} disabled={busy}>重置密码</button>
    {open && <form className="login-form" onSubmit={submit} aria-label={`重置 ${email} 的密码`}>
      <label>管理员当前密码<input type="password" autoComplete="current-password" required value={admin} onChange={e=>setAdmin(e.target.value)} disabled={busy}/></label>
      <label>用户临时密码<input type="password" autoComplete="new-password" required value={temporary} onChange={e=>setTemporary(e.target.value)} disabled={busy}/></label>
      <button disabled={busy}>{busy ? "重置中..." : "确认重置"}</button>
    </form>}{message && <p role="status">{message}</p>}</div>;
}
