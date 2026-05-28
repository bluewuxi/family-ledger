import { type FormEvent, useEffect, useState } from "react";
import {
  GAIN_COLOR_SCHEME_LABELS,
  GAIN_COLOR_SCHEMES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  UI_THEME_LABELS,
  UI_THEMES,
  type AuthenticatedUser,
  type GainColorScheme,
  type SnapshotDisplayCurrency,
  type UiTheme,
  type UserPreferences
} from "@family-ledger/shared";
import { CurrencySelect } from "../components/CurrencySelect";
import { ApiClientError, apiGet, apiPatch } from "../lib/apiClient";
import { usePreferences } from "../lib/preferencesContext";

interface PreferencesResponse {
  user: AuthenticatedUser;
  preferences: UserPreferences;
}

export function SettingsPage() {
  const { setPreferences } = usePreferences();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferredCurrency, setPreferredCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [gainColorScheme, setGainColorScheme] = useState<GainColorScheme>("red_positive");
  const [uiTheme, setUiTheme] = useState<UiTheme>("light");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadPreferences();
  }, []);

  async function loadPreferences() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const data = await apiGet<PreferencesResponse>("/settings/preferences");
      setUser(data.user);
      setPreferredCurrency(toDisplayCurrency(data.preferences.preferredCurrency));
      setGainColorScheme(toGainColorScheme(data.preferences.gainColorScheme));
      setUiTheme(toUiTheme(data.preferences.uiTheme));
      setPreferences(data.preferences);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const data = await apiPatch<PreferencesResponse>("/settings/preferences", { preferredCurrency, gainColorScheme, uiTheme });
      setPreferredCurrency(toDisplayCurrency(data.preferences.preferredCurrency));
      setGainColorScheme(toGainColorScheme(data.preferences.gainColorScheme));
      setUiTheme(toUiTheme(data.preferences.uiTheme));
      setPreferences(data.preferences);
      setNotice("偏好设置已保存。");
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>设置</h1>
          <p>维护当前用户的显示偏好。行情同步监控已移至“数据同步”。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPreferences} disabled={loading || saving}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="form-heading">
          <h2>用户偏好</h2>
          {user ? <span>{user.email}</span> : <span>正在加载偏好设置</span>}
        </div>

        <CurrencySelect
          label="报表默认币种"
          options={SNAPSHOT_DISPLAY_CURRENCIES}
          value={preferredCurrency}
          onChange={setPreferredCurrency}
          disabled={loading || saving}
        />

        <label>
          涨跌颜色
          <select
            value={gainColorScheme}
            onChange={(event) => setGainColorScheme(event.target.value as GainColorScheme)}
            disabled={loading || saving}
          >
            {GAIN_COLOR_SCHEMES.map((scheme) => (
              <option key={scheme} value={scheme}>
                {GAIN_COLOR_SCHEME_LABELS[scheme]}
              </option>
            ))}
          </select>
        </label>

        <label>
          界面主题
          <select value={uiTheme} onChange={(event) => setUiTheme(event.target.value as UiTheme)} disabled={loading || saving}>
            {UI_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {UI_THEME_LABELS[theme]}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={loading || saving}>
            {saving ? "保存中..." : "保存偏好"}
          </button>
        </div>
      </form>
    </section>
  );
}

function toDisplayCurrency(value: string): SnapshotDisplayCurrency {
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(value as SnapshotDisplayCurrency)
    ? (value as SnapshotDisplayCurrency)
    : "CNY";
}

function toGainColorScheme(value: string): GainColorScheme {
  return GAIN_COLOR_SCHEMES.includes(value as GainColorScheme) ? (value as GainColorScheme) : "red_positive";
}

function toUiTheme(value: string): UiTheme {
  return UI_THEMES.includes(value as UiTheme) ? (value as UiTheme) : "light";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "设置请求失败，请稍后重试。";
}
