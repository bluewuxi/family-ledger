import { observeAsync } from "../lib/observeAsync";
import { type FormEvent, useState } from "react";
import { resetUserPassword } from "../lib/authClient";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";

type ResetMessage = { key: "resetSaved" } | { key: "resetLength" } | UiErrorDescriptor;

export function PasswordResetForm({ userId, email }: { userId: string; email: string }) {
  const { t } = useTranslation("settings");
  const { language } = useUiLanguage();
  const [open,setOpen]=useState(false); const [admin,setAdmin]=useState(""); const [temporary,setTemporary]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState<ResetMessage | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    if ([...temporary].length < 8 || [...temporary].length > 128) { setMessage({ key: "resetLength" }); return; }
    setBusy(true);
    try { await resetUserPassword(userId,admin,temporary); setMessage({ key: "resetSaved" }); setOpen(false); }
    catch(reason) { setMessage(describeUiError(reason, "passwordReset")); }
    finally { setAdmin(""); setTemporary(""); setBusy(false); }
  }
  return <div className="password-reset-control"><button type="button" className="secondary-button" aria-expanded={open} onClick={()=>{setOpen(!open);setAdmin("");setTemporary("");}} disabled={busy}>{t("resetPassword")}</button>
    {open && <form className="login-form" onSubmit={(...args) => observeAsync((submit)(...args))} aria-label={t("resetFor", { email })}>
      <label>{t("adminPassword")}<input type="password" autoComplete="current-password" required value={admin} onChange={e=>setAdmin(e.target.value)} disabled={busy}/></label>
      <label>{t("temporaryPassword")}<input type="password" autoComplete="new-password" required value={temporary} onChange={e=>setTemporary(e.target.value)} disabled={busy}/></label>
      <button disabled={busy}>{t(busy ? "resetting" : "confirmReset")}</button>
    </form>}{message && <p role={message.key === "resetSaved" ? "status" : "alert"}>{message.key === "resetSaved" || message.key === "resetLength" ? t(message.key) : translateUiError(message, language)}</p>}</div>;
}
