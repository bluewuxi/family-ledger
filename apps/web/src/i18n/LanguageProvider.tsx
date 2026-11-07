import { useSyncExternalStore, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { getDisplayLocale } from "./language";
import { getUiLanguage, setUiLanguage, subscribeLanguage, i18n } from "./instance";

export function LanguageProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
export function useUiLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getUiLanguage, getUiLanguage);
  return {language, displayLocale: getDisplayLocale(language), setLanguage: setUiLanguage};
}
