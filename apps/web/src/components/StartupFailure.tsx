import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { claimDocumentTitle } from "../i18n/instance";
import { LanguageSwitch } from "./LanguageSwitch";
export function StartupFailure() {
  const {t} = useTranslation(["auth", "common"]);
  useEffect(() => { claimDocumentTitle(); document.title = t("configTitle") + " · " + t("common:productName"); }, [t]);
  return <main className="login-page"><section className="login-panel" aria-labelledby="config-error-title"><p className="eyebrow">{t("common:productName")}</p><h1 id="config-error-title">{t("configTitle")}</h1><p className="login-note">{t("configHelp")}</p><LanguageSwitch /></section></main>;
}
