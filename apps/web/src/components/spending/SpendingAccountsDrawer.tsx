import { useTranslation } from "react-i18next";
import { spendingFormatKey } from "../../i18n/cashflowLabels";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../../i18n/uiErrors";
import { useUiLanguage } from "../../i18n/LanguageProvider";
import { observeAsync } from "../../lib/observeAsync";
import { useState } from "react";
import {
  SPENDING_CURRENCIES,
  SPENDING_FORMATS,
  type SpendingFormat,
  type SpendingAccount,
} from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { spendingClient } from "../../lib/spendingClient";
interface Props {
  accounts: SpendingAccount[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}
export function SpendingAccountsDrawer({
  accounts,
  admin,
  onClose,
  onSaved,
}: Props) {
  const { t: translate } = useTranslation("spending");
  const { language } = useUiLanguage();
  const [id, setId] = useState<string>(),
    [form, setForm] = useState({
      name: "",
      source_format: "ccb_debit" as SpendingFormat,
      identity_suffix: "",
      default_currency: "CNY",
      is_active: true,
    });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<UiErrorDescriptor | null>(null);
  function reset() {
    setDirty(false);
    setId(undefined);
    setForm({
      name: "",
      source_format: "ccb_debit" as SpendingFormat,
      identity_suffix: "",
      default_currency: "CNY",
      is_active: true,
    });
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await spendingClient.saveAccount(form, id);
      onSaved();
      reset();
    } catch (e) {
      setError(describeUiError(e, "spendingSave"));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!id || !window.confirm(translate("confirmDeleteAccount")))
      return;
    setBusy(true);
    try {
      await spendingClient.deleteAccount(id);
      onSaved();
      reset();
    } catch (e) {
      setError(describeUiError(e, "spendingDelete"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open
      title={translate("accounts")}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <div className="spending-account-list">
        {accounts.map((a) => (
          <button
            className="secondary-button"
            key={a.id}
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm(translate("confirmDiscardAccount"))) return;
              setDirty(false);
              setId(a.id);
              setForm({
                name: a.name,
                source_format: a.source_format,
                identity_suffix: a.identity_suffix ?? "",
                default_currency: a.default_currency,
                is_active: a.is_active,
              });
            }}
          >
            {translate(a.is_active ? "accountSummary" : "accountStatus", {
              account: a.name,
              format: translate(spendingFormatKey(a.source_format)),
              currency: a.default_currency,
              status: translate("inactive"),
            })}
          </button>
        ))}
      </div>
      {!accounts.length && <p>{translate("emptyAccounts")}</p>}
      {error && (
        <p className="form-error" role="alert">
          {translateUiError(error, language)}
        </p>
      )}
      {admin && (
        <>
          <h3>{id ? translate("editAccount") : translate("newAccount")}</h3>
          <fieldset disabled={busy} className="spending-form" onChange={() => setDirty(true)}>
            <label>
              {translate("accountName")}
              <input
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {translate("bankFormat")}
              <select
                value={form.source_format}
                onChange={(e) =>
                  setForm({
                    ...form,
                    source_format: e.target.value as SpendingFormat,
                    default_currency: e.target.value === "bnz" ? "NZD" : "CNY",
                  })
                }
              >
                {SPENDING_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {translate(spendingFormatKey(f))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("optionalSuffix")}
              <input
                value={form.identity_suffix}
                maxLength={4}
                onChange={(e) =>
                  setForm({ ...form, identity_suffix: e.target.value })
                }
              />{" "}
            </label>
            {form.source_format === "ccb_credit" && (
              <p className="spending-hint">{translate("creditSuffixHint")}</p>
            )}
            <label>
              {translate("defaultCurrency")}
              <select
                value={form.default_currency}
                onChange={(e) =>
                  setForm({ ...form, default_currency: e.target.value })
                }
              >
                {SPENDING_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="spending-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              {translate("enableAccount")}
            </label>
            <div className="spending-actions">
              <button className="primary-button" onClick={() => observeAsync(save())}>
                {translate("save")}
              </button>
              {id && (
                <>
                  <button className="secondary-button" onClick={reset}>
                    {translate("newAccount")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => observeAsync(remove())}
                  >
                    {translate("delete")}
                  </button>
                </>
              )}
            </div>
          </fieldset>
        </>
      )}
    </Drawer>
  );
}
