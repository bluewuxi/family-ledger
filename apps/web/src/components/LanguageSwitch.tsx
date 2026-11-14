import { useUiLanguage } from "../i18n/LanguageProvider";
import { isUiLanguageEnabled } from "../i18n/language";
import { useTranslation } from "react-i18next";
export function LanguageSwitch() {
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("common");
  if (!isUiLanguageEnabled(import.meta.env.DEV, window.location.hostname)) return null;
  return <div className="language-switch"><div role="group" aria-label="中文 / English">{(["zh-CN", "en"] as const).map(value => <button className="secondary-button" key={value} type="button" aria-pressed={language === value} onClick={() => { void setLanguage(value).catch(() => console.error("Language switch failed")); }}>{value === "en" ? "English" : "中文"}</button>)}</div><small>{t("partial")}</small></div>;
}
