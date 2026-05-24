import { type FormEvent, useEffect, useState } from "react";
import {
  SNAPSHOT_DISPLAY_CURRENCIES,
  type AuthenticatedUser,
  type SnapshotDisplayCurrency,
  type UserPreferences
} from "@family-ledger/shared";
import { ApiClientError, apiGet, apiPatch } from "../lib/apiClient";

interface PreferencesResponse {
  user: AuthenticatedUser;
  preferences: UserPreferences;
}

export function SettingsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferredCurrency, setPreferredCurrency] = useState<SnapshotDisplayCurrency>("NZD");
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
      const data = await apiPatch<PreferencesResponse>("/settings/preferences", { preferredCurrency });
      setPreferredCurrency(toDisplayCurrency(data.preferences.preferredCurrency));
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

        <label>
          报表默认币种
          <select
            value={preferredCurrency}
            onChange={(event) => setPreferredCurrency(event.target.value as SnapshotDisplayCurrency)}
            disabled={loading || saving}
          >
            {SNAPSHOT_DISPLAY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>

        <label>
          界面主题
          <select value="system" disabled>
            <option value="system">跟随系统（待实现）</option>
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
    : "NZD";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "设置请求失败，请稍后重试。";
}
