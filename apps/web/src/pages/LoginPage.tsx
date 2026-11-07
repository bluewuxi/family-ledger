import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { BrandName } from "../components/BrandName";
import { observeAsync } from "../lib/observeAsync";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../lib/authClient";

export function LoginPage() {
  const {t} = useTranslation(["auth", "common"]);
  const {language} = useUiLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiErrorDescriptor | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const input = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    if (!email.trim()) { setError({key:"emailRequired"}); return; }
    if (input.validity.typeMismatch || !input.validity.valid) { setError({key:"emailInvalid"}); return; }
    if (!password) { setError({key:"passwordEmpty"}); return; }
    setLoading(true);
    setError(null);

    try {
      const session = await login(email, password);
      observeAsync(navigate(session.mustChangePassword ? "/change-password" : "/dashboard", { replace: true }));
    } catch (reason) {
      setError(describeUiError(reason, "login"));
    } finally { setPassword(""); setLoading(false); }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand-lockup">
          <img className="brand-mark login-brand-mark" src="/icon-128x128.png" alt="" aria-hidden="true" />
          <div>
            <h1 className="brand-name login-brand-name" id="login-title"><BrandName /></h1>
            <p className="brand-subtitle login-brand-subtitle" aria-label="Family Ledger">
              <span>Family</span>
              <span>Ledger</span>
            </p>
          </div>
        </div>

        <p className="login-note">{t("note")}</p>
        {params.has("passwordChanged") && <p role="status">{t("passwordChanged")}</p>}
        {params.has("logoutUnconfirmed") && <p className="form-error" role="alert">{t("logoutUnconfirmed")}</p>}

        <LanguageSwitch /><form noValidate className="login-form" onSubmit={(...args) => observeAsync((handleSubmit)(...args))}>
          <label>
            {t("email")}
            <input
              type="email"
              name="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              name="password"
              placeholder={t("passwordPlaceholder")}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error" role="alert">{translateUiError(error, language)}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? t("loggingIn") : t("login")}
          </button>
          <div className="login-form-footer">
            <p className="login-motto">{t("common:motto")}</p>
            <Link className="login-secondary-link" to="/forgot-password">
              {t("forgotLink")}
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
