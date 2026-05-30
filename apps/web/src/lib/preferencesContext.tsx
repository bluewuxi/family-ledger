import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  AuthenticatedUser,
  GainColorScheme,
  SnapshotDisplayCurrency,
  UiTheme,
  UserPreferences
} from "@family-ledger/shared";
import { ApiClientError, apiGet } from "./apiClient";

interface PreferencesResponse {
  user: AuthenticatedUser;
  preferences: UserPreferences;
}

interface PreferencesContextValue {
  user: AuthenticatedUser | null;
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  refreshPreferences: () => Promise<UserPreferences | null>;
  setPreferences: (preferences: UserPreferences) => void;
}

const themeStorageKey = "family-ledger.uiTheme";

const defaultPreferences: UserPreferences = {
  preferredCurrency: "CNY",
  gainColorScheme: "red_positive",
  uiTheme: readStoredUiTheme()
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPreferences = useCallback(async (): Promise<UserPreferences | null> => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<PreferencesResponse>("/settings/preferences");
      setUser(data.user);
      setPreferencesState(normalizePreferences(data.preferences));
      return data.preferences;
    } catch (requestError) {
      setError(toErrorMessage(requestError));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      user,
      preferences,
      loading,
      error,
      refreshPreferences,
      setPreferences: (nextPreferences) => setPreferencesState(normalizePreferences(nextPreferences))
    }),
    [error, loading, preferences, refreshPreferences, user]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.uiTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", preferences.uiTheme === "dark" ? "#07111F" : "#08264A");
    window.localStorage.setItem(themeStorageKey, preferences.uiTheme);
  }, [preferences.uiTheme]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);

  if (!value) {
    throw new Error("usePreferences must be used inside PreferencesProvider.");
  }

  return value;
}

export function signedToneClass(
  value: string | null | undefined,
  gainColorScheme: GainColorScheme,
  neutralAtFractionDigits?: number
): "metric-neutral" | "metric-red" | "metric-green" {
  if (value === null || value === undefined) {
    return "metric-neutral";
  }

  const numericValue = Number(value);

  if (
    !Number.isFinite(numericValue) ||
    numericValue === 0 ||
    (neutralAtFractionDigits !== undefined && isRoundedDisplayZero(numericValue, neutralAtFractionDigits))
  ) {
    return "metric-neutral";
  }

  const positiveIsRed = gainColorScheme === "red_positive";
  return numericValue > 0 === positiveIsRed ? "metric-red" : "metric-green";
}

function isRoundedDisplayZero(value: number, fractionDigits: number): boolean {
  const threshold = 0.5 * 10 ** -fractionDigits;
  return Math.abs(value) < threshold;
}

function normalizePreferences(preferences: UserPreferences): UserPreferences {
  return {
    preferredCurrency: normalizeCurrency(preferences.preferredCurrency),
    gainColorScheme: normalizeGainColorScheme(preferences.gainColorScheme),
    uiTheme: normalizeUiTheme(preferences.uiTheme)
  };
}

function normalizeCurrency(value: string): SnapshotDisplayCurrency {
  return value === "NZD" || value === "USD" || value === "CNY" ? value : "CNY";
}

function normalizeGainColorScheme(value: string): GainColorScheme {
  return value === "green_positive" ? "green_positive" : "red_positive";
}

function normalizeUiTheme(value: string): UiTheme {
  return value === "dark" ? "dark" : "light";
}

function readStoredUiTheme(): UiTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return normalizeUiTheme(window.localStorage.getItem(themeStorageKey) ?? "light");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "偏好设置请求失败，请稍后重试。";
}
