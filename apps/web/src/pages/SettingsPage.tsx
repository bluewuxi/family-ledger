import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { AccountAccessEditor } from "../components/AccountAccessEditor";
import { Link } from "react-router-dom";
import { PasswordResetForm } from "../components/PasswordResetForm";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { KeyRound, Power, RefreshCw, Save, ShieldCheck, Users } from "lucide-react";
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
import { formatLocalDateTime } from "../lib/timeFormat";

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

interface TradingPasswordGateResponse {
  parameterPath?: string;
  isInitialized: boolean;
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
  const [loadingTradingPasswordGate, setLoadingTradingPasswordGate] = useState(false);
  const [savingTradingPasswordGate, setSavingTradingPasswordGate] = useState(false);
  const [tradingPasswordGateInitialized, setTradingPasswordGateInitialized] = useState(false);
  const [tradingPasswordGateParameterPath, setTradingPasswordGateParameterPath] = useState<string | null>(null);
  const [currentExtraPassword, setCurrentExtraPassword] = useState("");
  const [newExtraPassword, setNewExtraPassword] = useState("");
  const [confirmExtraPassword, setConfirmExtraPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userManagementError, setUserManagementError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userManagementNotice, setUserManagementNotice] = useState<string | null>(null);

  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  const [accessEditor, setAccessEditor] = useState<{ user: ManagedUser; demoting: boolean } | null>(null);
  const isAdmin = user?.role === "admin";

const loadPreferences = useEventCallback(async function() {
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
        await loadTradingPasswordGate();
      } else {
        setManagedUsers([]);
        setTradingPasswordGateInitialized(false);
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  });
  useEffect(() => {
    observeAsync(loadPreferences());
  }, [loadPreferences]);

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

  async function loadTradingPasswordGate() {
    setLoadingTradingPasswordGate(true);
    setGateError(null);

    try {
      const data = await apiGet<TradingPasswordGateResponse>("/settings/trading-password-gate");
      setTradingPasswordGateInitialized(data.isInitialized);
      setTradingPasswordGateParameterPath(data.parameterPath ?? null);
    } catch (requestError) {
      setGateError(toErrorMessage(requestError));
    } finally {
      setLoadingTradingPasswordGate(false);
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
    if (targetUser.role === "admin" && role === "viewer") { setAccessEditor({ user: targetUser, demoting: true }); return; }
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

  async function handleTradingPasswordGateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGateError(null);
    setGateNotice(null);

    if (newExtraPassword !== confirmExtraPassword) {
      setGateError("两次输入的新额外密码不一致。");
      return;
    }

    setSavingTradingPasswordGate(true);

    try {
      const data = await apiPatch<TradingPasswordGateResponse>("/settings/trading-password-gate", {
        currentExtraPassword: currentExtraPassword || null,
        newExtraPassword
      });
      setTradingPasswordGateInitialized(data.isInitialized);
      setCurrentExtraPassword("");
      setNewExtraPassword("");
      setConfirmExtraPassword("");
      setGateNotice("交易密码额外密码已更新。");
    } catch (requestError) {
      setGateError(toErrorMessage(requestError));
    } finally {
      setSavingTradingPasswordGate(false);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/settings">设置</PageTitle>
          <p>维护当前用户的显示偏好。管理员可停用访问并维护用户角色。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => observeAsync((loadPreferences)())} disabled={loading || saving || loadingUsers}>
          <RefreshCw size={17} aria-hidden="true" />
          <span>刷新</span>
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <form className="settings-form" onSubmit={(...args) => observeAsync((handleSubmit)(...args))}>
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
          {user && !isAdmin ? <Link className="secondary-button" to="/change-password">修改登录密码</Link> : null}
          <button className="primary-button" type="submit" disabled={loading || saving}>
            <Save size={17} aria-hidden="true" />
            <span>{saving ? "保存中..." : "保存偏好"}</span>
          </button>
        </div>
      </form>

      {isAdmin ? (
        <>
          <section className="settings-user-section" aria-labelledby="user-management-title">
            <div className="settings-section-header">
              <div>
                <h2 id="user-management-title">
                  <Users size={18} aria-hidden="true" />
                  用户访问
                </h2>
                <p>用户由管理员创建，可在这里维护访问状态、角色和登录密码。</p>
              </div>
              <div className="settings-user-actions">
              <Link className="secondary-button" to="/change-password">修改登录密码</Link>
              <button
                className="secondary-button"
                type="button"
                onClick={() => { observeAsync(loadManagedUsers()); }}
                disabled={loadingUsers || savingUserId !== null}
              >
                <RefreshCw size={17} aria-hidden="true" />
                <span>刷新用户</span>
              </button>
              </div>
            </div>

            {userManagementError ? <p className="form-error settings-inline-message">{userManagementError}</p> : null}
            {userManagementNotice ? <p className="form-success settings-inline-message">{userManagementNotice}</p> : null}

            {accessEditor && <AccountAccessEditor key={`${accessEditor.user.id}:${accessEditor.demoting}`} user={accessEditor.user} demoting={accessEditor.demoting} onClose={() => setAccessEditor(null)} onSaved={() => observeAsync(loadManagedUsers())} />}
            <div className="table-wrap">
              <table className="settings-user-table">
                <thead>
                  <tr>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>最近登录</th>
                    <th>重置密码</th><th>账户范围</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td className="table-loading-cell" colSpan={7}>
                        正在加载用户
                      </td>
                    </tr>
                  ) : managedUsers.length === 0 ? (
                    <tr>
                      <td className="table-loading-cell" colSpan={7}>
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
                              onChange={(event) => observeAsync(handleRoleChange(managedUser, event.target.value as UserRole))}
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
                          <td>{!isSelf ? <PasswordResetForm userId={managedUser.id} email={managedUser.email ?? "用户"} /> : "—"}</td>
                          <td><button className="secondary-button" type="button" disabled={isSelf || isSavingUser} onClick={() => setAccessEditor({ user: managedUser, demoting: false })}>账户范围</button></td>
                          <td>
                            <button
                              className={managedUser.isActive ? "danger-button" : "secondary-button"}
                              type="button"
                              onClick={() => observeAsync(handleAccessToggle(managedUser))}
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
            <form className="settings-form trading-gate-form" onSubmit={(...args) => observeAsync((handleTradingPasswordGateSubmit)(...args))}>
              <div className="form-heading">
                <h2>
                  <KeyRound size={18} aria-hidden="true" />
                  用于查看交易密码的密码
                </h2>
                <span>{tradingPasswordGateInitialized ? "已设置" : "首次设置"}</span>
              </div>

              <div className="wide-field settings-gate-help">
                <button className="settings-help-button" type="button" onClick={() => recoveryDialog.current?.showModal()}>忘记密码？</button>
              </div>
              {gateError ? <p className="form-error wide-field" role="alert">{gateError}</p> : null}
              {gateNotice ? <p className="form-success wide-field" role="status">{gateNotice}</p> : null}

              {tradingPasswordGateInitialized ? (
                <label>
                  当前额外密码
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentExtraPassword}
                    onChange={(event) => setCurrentExtraPassword(event.target.value)}
                    disabled={loadingTradingPasswordGate || savingTradingPasswordGate}
                    required
                  />
                </label>
              ) : null}

              <label>
                新额外密码
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newExtraPassword}
                  onChange={(event) => setNewExtraPassword(event.target.value)}
                  disabled={loadingTradingPasswordGate || savingTradingPasswordGate}
                  required
                />
              </label>

              <label>
                确认新额外密码
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmExtraPassword}
                  onChange={(event) => setConfirmExtraPassword(event.target.value)}
                  disabled={loadingTradingPasswordGate || savingTradingPasswordGate}
                  required
                />
              </label>

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={loadingTradingPasswordGate || savingTradingPasswordGate}>
                  <Save size={17} aria-hidden="true" />
                  <span>{savingTradingPasswordGate ? "保存中..." : "保存额外密码"}</span>
                </button>
              </div>
            </form>

          <dialog ref={recoveryDialog} className="settings-recovery-dialog" aria-labelledby="extra-password-recovery-title" aria-describedby="extra-password-recovery-description">
            <h2 id="extra-password-recovery-title">忘记额外密码？</h2>
            <p id="extra-password-recovery-description">请联系系统维护人员，在确认当前环境后，到 AWS Console 将 SSM 参数 <code>{tradingPasswordGateParameterPath ?? "（路径暂不可用，请刷新设置后重试）"}</code> 重置为 <code>empty</code>，再回来设置新密码。</p>
            <p>此操作需要系统维护权限；点击此提示不会重置密码。</p>
            <form method="dialog"><button className="primary-button" autoFocus>知道了</button></form>
          </dialog>
        </>
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
  return formatLocalDateTime(value, "从未登录");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "设置请求失败，请稍后重试。";
}
