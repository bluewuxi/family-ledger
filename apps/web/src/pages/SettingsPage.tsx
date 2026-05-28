import { type FormEvent, useEffect, useState } from "react";
import { Power, RefreshCw, Save, ShieldCheck, Users } from "lucide-react";
import {
  GAIN_COLOR_SCHEME_LABELS,
  GAIN_COLOR_SCHEMES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  UI_THEME_LABELS,
  UI_THEMES,
  type AuthenticatedUser,
  type GainColorScheme,
  type ManagedUser,
  type SnapshotDisplayCurrency,
  type UiTheme,
  type UserPreferences,
  type UserRole
} from "@family-ledger/shared";
import { CurrencySelect } from "../components/CurrencySelect";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet, apiPatch } from "../lib/apiClient";
import { usePreferences } from "../lib/preferencesContext";

interface PreferencesResponse {
  user: AuthenticatedUser;
  preferences: UserPreferences;
}

interface ManagedUsersResponse {
  user: AuthenticatedUser;
  users: ManagedUser[];
}

interface UpdateManagedUserResponse {
  managedUser: ManagedUser;
}

export function SettingsPage() {
  const { setPreferences } = usePreferences();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferredCurrency, setPreferredCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [gainColorScheme, setGainColorScheme] = useState<GainColorScheme>("red_positive");
  const [uiTheme, setUiTheme] = useState<UiTheme>("light");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userManagementError, setUserManagementError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userManagementNotice, setUserManagementNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

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

      if (data.user.role === "admin") {
        await loadManagedUsers();
      } else {
        setManagedUsers([]);
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadManagedUsers() {
    setLoadingUsers(true);
    setUserManagementError(null);
    setUserManagementNotice(null);

    try {
      const data = await apiGet<ManagedUsersResponse>("/users");
      setManagedUsers(data.users);
    } catch (requestError) {
      setUserManagementError(toErrorMessage(requestError));
    } finally {
      setLoadingUsers(false);
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

  async function handleRoleChange(targetUser: ManagedUser, role: UserRole) {
    await updateUserAccess(targetUser, { role }, "用户角色已更新。");
  }

  async function handleAccessToggle(targetUser: ManagedUser) {
    await updateUserAccess(targetUser, { isActive: !targetUser.isActive }, targetUser.isActive ? "用户访问已停用。" : "用户访问已启用。");
  }

  async function updateUserAccess(targetUser: ManagedUser, input: { role?: UserRole; isActive?: boolean }, successMessage: string) {
    setSavingUserId(targetUser.id);
    setUserManagementError(null);
    setUserManagementNotice(null);

    try {
      const data = await apiPatch<UpdateManagedUserResponse>(`/users/${targetUser.id}`, input);
      setManagedUsers((currentUsers) =>
        currentUsers.map((item) => (item.id === data.managedUser.id ? data.managedUser : item))
      );
      setUserManagementNotice(successMessage);
    } catch (requestError) {
      setUserManagementError(toErrorMessage(requestError));
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/settings">设置</PageTitle>
          <p>维护当前用户的显示偏好。管理员可停用访问并维护用户角色。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPreferences} disabled={loading || saving || loadingUsers}>
          <RefreshCw size={17} aria-hidden="true" />
          <span>刷新</span>
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
            <Save size={17} aria-hidden="true" />
            <span>{saving ? "保存中..." : "保存偏好"}</span>
          </button>
        </div>
      </form>

      {isAdmin ? (
        <section className="settings-user-section" aria-labelledby="user-management-title">
          <div className="settings-section-header">
            <div>
              <h2 id="user-management-title">
                <Users size={18} aria-hidden="true" />
                用户访问
              </h2>
              <p>Supabase 控制台创建用户后，可在这里维护访问状态和角色。</p>
            </div>
            <button className="secondary-button" type="button" onClick={loadManagedUsers} disabled={loadingUsers || savingUserId !== null}>
              <RefreshCw size={17} aria-hidden="true" />
              <span>刷新用户</span>
            </button>
          </div>

          {userManagementError ? <p className="form-error settings-inline-message">{userManagementError}</p> : null}
          {userManagementNotice ? <p className="form-success settings-inline-message">{userManagementNotice}</p> : null}

          <div className="table-wrap">
            <table className="settings-user-table">
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>最近登录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td className="table-loading-cell" colSpan={5}>
                      正在加载用户
                    </td>
                  </tr>
                ) : managedUsers.length === 0 ? (
                  <tr>
                    <td className="table-loading-cell" colSpan={5}>
                      暂无用户
                    </td>
                  </tr>
                ) : (
                  managedUsers.map((managedUser) => {
                    const isSelf = managedUser.id === user?.id;
                    const isSavingUser = savingUserId === managedUser.id;
                    return (
                      <tr key={managedUser.id}>
                        <td>
                          <strong>{managedUser.email ?? "未设置邮箱"}</strong>
                          {isSelf ? <span className="settings-self-badge">当前用户</span> : null}
                        </td>
                        <td>
                          <label className="sr-only" htmlFor={`role-${managedUser.id}`}>
                            角色
                          </label>
                          <select
                            id={`role-${managedUser.id}`}
                            className="settings-role-select"
                            value={managedUser.role ?? "viewer"}
                            onChange={(event) => void handleRoleChange(managedUser, event.target.value as UserRole)}
                            disabled={isSelf || isSavingUser}
                          >
                            <option value="admin">管理员</option>
                            <option value="viewer">查看者</option>
                          </select>
                        </td>
                        <td>
                          <span className={managedUser.isActive ? "status-pill status-pill-active" : "status-pill status-pill-paused"}>
                            {managedUser.isActive ? "已启用" : "已停用"}
                          </span>
                        </td>
                        <td>{formatDateTime(managedUser.lastSignInAt)}</td>
                        <td>
                          <button
                            className={managedUser.isActive ? "danger-button" : "secondary-button"}
                            type="button"
                            onClick={() => void handleAccessToggle(managedUser)}
                            disabled={isSelf || isSavingUser}
                          >
                            {managedUser.isActive ? <Power size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                            <span>{managedUser.isActive ? "停用" : "启用"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
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

function formatDateTime(value: string | null): string {
  if (!value) {
    return "从未登录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "设置请求失败，请稍后重试。";
}
