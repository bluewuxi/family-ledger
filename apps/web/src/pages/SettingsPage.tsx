import { Trans, useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { AccountAccessEditor } from "../components/AccountAccessEditor";
import { Link } from "react-router-dom";
import { PasswordResetForm } from "../components/PasswordResetForm";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { KeyRound, Power, RefreshCw, Save, ShieldCheck, Users } from "lucide-react";
import {
  GAIN_COLOR_SCHEMES,
  SNAPSHOT_DISPLAY_CURRENCIES,
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
import { LanguageSwitch } from "../components/LanguageSwitch";
import { PageTitle } from "../components/PageTitle";
import { apiGet, apiPatch } from "../lib/apiClient";
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

type SettingsNotice = "preferencesSaved" | "roleSaved" | "accessPaused" | "accessEnabled" | "gateSaved";
type SettingsError = UiErrorDescriptor | { key: "gateMismatch" };

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { language } = useUiLanguage();
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
  const [error, setError] = useState<UiErrorDescriptor | null>(null);
  const [userManagementError, setUserManagementError] = useState<UiErrorDescriptor | null>(null);
  const [notice, setNotice] = useState<SettingsNotice | null>(null);
  const [userManagementNotice, setUserManagementNotice] = useState<SettingsNotice | null>(null);

  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const [gateError, setGateError] = useState<SettingsError | null>(null);
  const [gateNotice, setGateNotice] = useState<SettingsNotice | null>(null);

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
      setError(describeUiError(requestError, "settingsRead"));
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
      setUserManagementError(describeUiError(requestError, "accessRead"));
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
      setGateError(describeUiError(requestError, "gateRead"));
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
      setNotice("preferencesSaved");
    } catch (requestError) {
      setError(describeUiError(requestError, "settingsSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(targetUser: ManagedUser, role: UserRole) {
    if (targetUser.role === "admin" && role === "viewer") { setAccessEditor({ user: targetUser, demoting: true }); return; }
    await updateUserAccess(targetUser, { role }, "roleSaved");
  }

  async function handleAccessToggle(targetUser: ManagedUser) {
    await updateUserAccess(targetUser, { isActive: !targetUser.isActive }, targetUser.isActive ? "accessPaused" : "accessEnabled");
  }

  async function updateUserAccess(targetUser: ManagedUser, input: { role?: UserRole; isActive?: boolean }, successMessage: SettingsNotice) {
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
      setUserManagementError(describeUiError(requestError, "accessSave"));
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleTradingPasswordGateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGateError(null);
    setGateNotice(null);

    if (newExtraPassword !== confirmExtraPassword) {
      setGateError({ key: "gateMismatch" });
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
      setGateNotice("gateSaved");
    } catch (requestError) {
      setGateError(describeUiError(requestError, "gateSave"));
    } finally {
      setSavingTradingPasswordGate(false);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/settings">{t("title")}</PageTitle>
          <Link className="page-back-link" to="/about">{t("about")}</Link>
          <p>{t("intro")}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => observeAsync((loadPreferences)())} disabled={loading || saving || loadingUsers}>
          <RefreshCw size={17} aria-hidden="true" />
          <span>{t("refresh")}</span>
        </button>
      </header>

      {error ? <p className="form-error" role="alert">{translateUiError(error, language)}</p> : null}
      {notice ? <p className="form-success" role="status">{t(notice)}</p> : null}

      <form className="settings-form" onSubmit={(...args) => observeAsync((handleSubmit)(...args))}>
        <div className="form-heading">
          <h2>{t("preferences")}</h2>
          {user ? <span>{user.email}</span> : <span>{t("loadingPreferences")}</span>}
        </div>

        <CurrencySelect
          label={t("reportCurrency")}
          options={SNAPSHOT_DISPLAY_CURRENCIES}
          value={preferredCurrency}
          onChange={setPreferredCurrency}
          disabled={loading || saving}
        />

        <label>
          {t("gainColors")}
          <select
            value={gainColorScheme}
            onChange={(event) => setGainColorScheme(event.target.value as GainColorScheme)}
            disabled={loading || saving}
          >
            {GAIN_COLOR_SCHEMES.map((scheme) => (
              <option key={scheme} value={scheme}>
                {t(scheme === "red_positive" ? "redPositive" : "greenPositive")}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("theme")}
          <select value={uiTheme} onChange={(event) => setUiTheme(event.target.value as UiTheme)} disabled={loading || saving}>
            {UI_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(theme)}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          {user && !isAdmin ? <Link className="secondary-button" to="/change-password">{t("changePassword")}</Link> : null}
          <button className="primary-button" type="submit" disabled={loading || saving}>
            <Save size={17} aria-hidden="true" />
            <span>{saving ? t("saving") : t("savePreferences")}</span>
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
                  {t("users")}
                </h2>
                <p>{t("usersIntro")}</p>
              </div>
              <div className="settings-user-actions">
              <Link className="secondary-button" to="/change-password">{t("changePassword")}</Link>
              <button
                className="secondary-button"
                type="button"
                onClick={() => { observeAsync(loadManagedUsers()); }}
                disabled={loadingUsers || savingUserId !== null}
              >
                <RefreshCw size={17} aria-hidden="true" />
                <span>{t("refreshUsers")}</span>
              </button>
              </div>
            </div>

            {userManagementError ? <p className="form-error settings-inline-message" role="alert">{translateUiError(userManagementError, language)}</p> : null}
            {userManagementNotice ? <p className="form-success settings-inline-message" role="status">{t(userManagementNotice)}</p> : null}

            {accessEditor && <AccountAccessEditor key={`${accessEditor.user.id}:${accessEditor.demoting}`} user={accessEditor.user} demoting={accessEditor.demoting} onClose={() => setAccessEditor(null)} onSaved={() => observeAsync(loadManagedUsers())} />}
            <div className="table-wrap">
              <table className="settings-user-table">
                <thead>
                  <tr>
                    <th>{t("email")}</th>
                    <th>{t("role")}</th>
                    <th>{t("status")}</th>
                    <th>{t("lastSignIn")}</th>
                    <th>{t("resetPassword")}</th><th>{t("accountScope")}</th><th>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td className="table-loading-cell" colSpan={7}>
                        {t("loadingUsers")}
                      </td>
                    </tr>
                  ) : managedUsers.length === 0 ? (
                    <tr>
                      <td className="table-loading-cell" colSpan={7}>
                        {t("noUsers")}
                      </td>
                    </tr>
                  ) : (
                    managedUsers.map((managedUser) => {
                      const isSelf = managedUser.id === user?.id;
                      const isSavingUser = savingUserId === managedUser.id;
                      return (
                        <tr key={managedUser.id}>
                          <td>
                            <strong>{managedUser.email ?? t("missingEmail")}</strong>
                            {isSelf ? <span className="settings-self-badge">{t("self")}</span> : null}
                          </td>
                          <td>
                            <label className="sr-only" htmlFor={`role-${managedUser.id}`}>
                              {t("role")}
                            </label>
                            <select
                              id={`role-${managedUser.id}`}
                              className="settings-role-select"
                              value={managedUser.role ?? "viewer"}
                              onChange={(event) => observeAsync(handleRoleChange(managedUser, event.target.value as UserRole))}
                              disabled={isSelf || isSavingUser}
                            >
                              <option value="admin">{t("admin")}</option>
                              <option value="viewer">{t("viewer")}</option>
                            </select>
                          </td>
                          <td>
                            <span className={managedUser.isActive ? "status-pill status-pill-active" : "status-pill status-pill-paused"}>
                              {managedUser.isActive ? t("active") : t("paused")}
                            </span>
                          </td>
                          <td>{formatLocalDateTime(managedUser.lastSignInAt, t("neverSignedIn"), undefined, language)}</td>
                          <td>{!isSelf ? <PasswordResetForm userId={managedUser.id} email={managedUser.email ?? t("user")} /> : "—"}</td>
                          <td><button className="secondary-button" type="button" disabled={isSelf || isSavingUser} onClick={() => setAccessEditor({ user: managedUser, demoting: false })}>{t("accountScope")}</button></td>
                          <td>
                            <button
                              className={managedUser.isActive ? "danger-button" : "secondary-button"}
                              type="button"
                              onClick={() => observeAsync(handleAccessToggle(managedUser))}
                              disabled={isSelf || isSavingUser}
                            >
                              {managedUser.isActive ? <Power size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                              <span>{managedUser.isActive ? t("pause") : t("enable")}</span>
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
                  {t("gateTitle")}
                </h2>
                <span>{tradingPasswordGateInitialized ? t("gateSet") : t("gateFirst")}</span>
              </div>

              <div className="wide-field settings-gate-help">
                <button className="settings-help-button" type="button" onClick={() => recoveryDialog.current?.showModal()}>{t("forgotGate")}</button>
              </div>
              {gateError ? <p className="form-error wide-field" role="alert">{gateError.key === "gateMismatch" ? t("gateMismatch") : translateUiError(gateError, language)}</p> : null}
              {gateNotice ? <p className="form-success wide-field" role="status">{t(gateNotice)}</p> : null}

              {tradingPasswordGateInitialized ? (
                <label>
                  {t("currentExtra")}
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
                {t("newExtra")}
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
                {t("confirmExtra")}
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
                  <span>{savingTradingPasswordGate ? t("saving") : t("saveGate")}</span>
                </button>
              </div>
            </form>

          <dialog ref={recoveryDialog} className="settings-recovery-dialog" aria-labelledby="extra-password-recovery-title" aria-describedby="extra-password-recovery-description">
            <h2 id="extra-password-recovery-title">{t("recoveryTitle")}</h2>
            <p id="extra-password-recovery-description"><Trans t={t} i18nKey="recoveryDescription" components={{ path: <code>{tradingPasswordGateParameterPath ?? t("missingPath")}</code>, empty: <code /> }} /></p>
            <p>{t("recoveryNote")}</p>
            <LanguageSwitch />
            <form method="dialog"><button className="primary-button" autoFocus>{t("acknowledge")}</button></form>
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
