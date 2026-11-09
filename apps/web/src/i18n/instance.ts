import { createInstance } from "i18next";
import { resources } from "./resources";
import { createLanguageStore, isLocalLanguagePreview, type UiLanguage } from "./language";

export const i18n = createInstance();
// Bundled resources initialize synchronously for pure, fixed-language format lookups.
const resourcesReady = i18n.init({ resources, lng: "zh-CN", fallbackLng: "zh-CN", supportedLngs: ["zh-CN", "en"],
  load: "currentOnly", defaultNS: "common", ns: ["common","format","preview","auth","navigation","errors","investmentGroups","investment","dashboard","holdings","monthlyReview","accounts","instruments","transactions"], interpolation: { escapeValue: false }, initAsync: false });
const preview = isLocalLanguagePreview(import.meta.env?.DEV === true, typeof window === "undefined" ? "" : window.location.hostname);
const store = createLanguageStore({ preview, getStorage: () => window.localStorage });
let routedTitleOwned = false;
export function claimDocumentTitle(): void { routedTitleOwned = true; }
let initialization: Promise<void> | undefined;
let changes = Promise.resolve();

export function initializeI18n(): Promise<void> {
  initialization ??= store.initialize().then(async () => {
    await resourcesReady;
    await i18n.changeLanguage(store.getLanguage());
    syncDocumentMetadata();
  });
  return initialization;
}
export const getUiLanguage = store.getLanguage;
export const subscribeLanguage = store.subscribe;
export function setUiLanguage(language: UiLanguage): Promise<void> {
  // Serialize rapid requests so older async completions cannot overwrite the last choice.
  changes = changes.then(async () => {
    await initializeI18n();
    await i18n.changeLanguage(preview ? language : "zh-CN");
    await store.setLanguage(language);
    syncDocumentMetadata();
  });
  return changes;
}
function syncDocumentMetadata(): void {
  if (typeof document === "undefined") return;
  const language = getUiLanguage();
  document.documentElement.lang = language;
  if (!routedTitleOwned) document.title = language === "en" ? "Family Ledger" : "金财屋 · Family Ledger";
  for (const name of ["application-name", "apple-mobile-web-app-title"]) {
    document.querySelector(`meta[name="${name}"]`)?.setAttribute("content", i18n.getFixedT(language)("productName"));
  }
}
