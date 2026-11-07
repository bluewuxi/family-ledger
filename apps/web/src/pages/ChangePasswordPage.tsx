import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { observeAsync } from "../lib/observeAsync";
import { PageBackLink } from "../components/PageBackLink";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, getCurrentSession } from "../lib/authClient";
import { useAuth } from "../lib/authContext";
export function ChangePasswordPage() {
  const {t} = useTranslation(["auth", "navigation"]); const {language} = useUiLanguage();
  const { session, signOut } = useAuth(); const navigate = useNavigate();
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<UiErrorDescriptor | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(null);
    if (!current) { setError({key:"currentPasswordEmpty"}); return; }
    if ([...password].length < 8 || [...password].length > 128 || new TextEncoder().encode(password).length > 512) { setError({key:"passwordLength"}); return; }
    if (password !== confirm) { setError({key:"passwordMismatch"}); return; }
    setBusy(true);
    try { if (await changePassword(current, password) && !getCurrentSession()) observeAsync(navigate("/login?passwordChanged=1", { replace: true })); }
    catch (reason) { setError(describeUiError(reason, "changePassword")); }
    finally { setCurrent(""); setPassword(""); setConfirm(""); setBusy(false); }
  }
  return <main className="login-page"><section className="login-panel">{!session?.mustChangePassword && <PageBackLink to="/settings" label={t("navigation:settings")} />}<h1>{t("changeTitle")}</h1>
    <p className="login-note">{session?.mustChangePassword ? t("forced") : t("changeNote")}</p>
    <LanguageSwitch /><form noValidate className="login-form" onSubmit={(...args) => observeAsync((submit)(...args))}>
      <label>{t("currentPassword")}<input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required disabled={busy}/></label>
      <label>{t("newPassword")}<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label>
      <label>{t("confirmPassword")}<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required disabled={busy}/></label>
      {error && <p className="form-error" role="alert">{translateUiError(error, language)}</p>}<button disabled={busy}>{busy ? t("changing") : t("change")}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => { void signOut().then(changed => { if (changed && !getCurrentSession()) observeAsync(navigate("/login", {replace:true})); }).catch(() => { if (!getCurrentSession()) observeAsync(navigate("/login?logoutUnconfirmed=1", {replace:true})); }); }}>{t("logout")}</button>

    </form></section></main>;
}
