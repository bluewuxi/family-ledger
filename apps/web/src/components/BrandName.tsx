import { useUiLanguage } from "../i18n/LanguageProvider";
export function BrandName({className}: {className?: string}) {
  const {language} = useUiLanguage();
  return <span className={className}>{language === "en" ? "Family Ledger" : <><span className="brand-name-gold">金</span><span>财</span><span className="brand-name-emphasis">屋</span></>}</span>;
}
