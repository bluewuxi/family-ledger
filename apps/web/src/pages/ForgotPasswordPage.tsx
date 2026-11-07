import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LanguageSwitch } from "../components/LanguageSwitch";
export function ForgotPasswordPage() {
 const {t} = useTranslation("auth");
 return <main className="login-page"><section className="login-panel"><h1>{t("forgotTitle")}</h1><p className="login-note">{t("recovery")}</p><Link className="login-secondary-link" to="/login">{t("backLogin")}</Link><LanguageSwitch /></section></main>;
}
