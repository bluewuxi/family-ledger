export type UiLanguage = "zh-CN" | "en";
export type DisplayLocale = "zh-CN" | "en-NZ";
export const languageStorageKey = "family-ledger.uiLanguage";
export function parseUiLanguage(value: unknown): UiLanguage | null {
  return value === "en" || value === "zh-CN" ? value : null;
}
export function getDisplayLocale(language: UiLanguage): DisplayLocale {
  return language === "en" ? "en-NZ" : "zh-CN";
}
export function isLocalLanguagePreview(dev: boolean, hostname: string): boolean {
  return dev && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function createLanguageStore(options: { preview: boolean; getStorage: () => Pick<Storage, "getItem" | "setItem"> }) {
  let language: UiLanguage = "zh-CN";
  let initialized: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: UiLanguage) => {
    if (language === next) return;
    language = next;
    listeners.forEach(listener => listener());
  };
  const initialize = (): Promise<void> => {
    if (!initialized) {
      if (options.preview) {
        try { language = parseUiLanguage(options.getStorage().getItem(languageStorageKey)) ?? "zh-CN"; }
        catch { language = "zh-CN"; }
      }
      initialized = Promise.resolve();
    }
    return initialized;
  };
  return {
    initialize,
    getLanguage: (): UiLanguage => language,
    setLanguage: async (next: UiLanguage): Promise<void> => {
      await initialize();
      if (!parseUiLanguage(next) || (!options.preview && next !== "zh-CN")) return;
      publish(next);
      if (options.preview) {
        try { options.getStorage().setItem(languageStorageKey, next); }
        catch { /* Successful in-memory choice survives unavailable persistence. */ }
      }
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}
