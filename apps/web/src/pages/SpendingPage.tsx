import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { formatCalendarDate } from "../lib/timeFormat";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { observeAsync } from "../lib/observeAsync";
import { SPENDING_CURRENCIES } from "@family-ledger/shared";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  SPENDING_CLASSES,
  type SpendingAccount,
  type SpendingFilterOptions,
  type SpendingQueryResult,
  type StatementRow,
} from "@family-ledger/shared";
import { spendingClient } from "../lib/spendingClient";
import { formatSpendingAmount as money } from "../lib/spendingFormat";
import { PaginationControls } from "../components/PaginationControls";
import { SpendingAccountsDrawer } from "../components/spending/SpendingAccountsDrawer";
import { SpendingRowDrawer } from "../components/spending/SpendingRowDrawer";
import { SpendingCharts } from "../components/spending/SpendingCharts";
import { familyCashflowFilters } from "../lib/familyCashflowNavigation";
import { useCashflowQuery } from "../lib/useCashflowQuery";
import { DatePresets } from "../components/cashflow/DatePresets";
export function SpendingPage() {
  const { t: translate } = useTranslation("spending");
  const { t: cashflow } = useTranslation("cashflow");
  const { language } = useUiLanguage();
  const navigate = useNavigate();
  const filters = useCashflowQuery("spending");
  const [params, setParams] = useSearchParams(),
    [accounts, setAccounts] = useState<SpendingAccount[]>([]),
    [admin, setAdmin] = useState(false),
    [tags, setTags] = useState<string[]>([]),
    [options, setOptions] = useState<SpendingFilterOptions>({ tags: [], accountNumberLast4: [], counterpartyAccountLast4: [] });
  const [result, setResult] = useState<SpendingQueryResult>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<UiErrorDescriptor | null>(null),
    [revision, setRevision] = useState(0);
  const [drawer, setDrawer] = useState<"accounts" | "imports" | "row" | null>(
      null,
    ),
    [row, setRow] = useState<StatementRow>(),
    [selected, setSelected] = useState<string[]>([]),
    [bulkClass, setBulkClass] = useState(""),
    [bulkTag, setBulkTag] = useState("");
  const q = familyCashflowFilters("spending", params);
  q.set("limit", "50");
  const query = q.toString();
  const refresh = () => setRevision((n) => n + 1);
  function filter(values: Record<string, string>) {
    setParams((old) => {
      const p = new URLSearchParams(old);
      p.set("tab", "spending");
      p.delete("offset");
      Object.entries(values).forEach(([k, v]) => {
        if (v) p.set(k, v);
        else p.delete(k);
      });
      return p;
    });
  }
  const draftAccountId = filters.draft.get("accountId") ?? "";
  useEffect(() => {
    let active = true;
    void spendingClient
      .accounts()
      .then((r) => {
        if (active) {
          setAccounts(r.accounts);
          setAdmin(r.user.role === "admin");
        }
      })
      .catch((e) => {
        if (active) setError(describeUiError(e, "spendingRead"));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    void spendingClient
      .options(draftAccountId)
      .then((r) => {
        if (active) { setTags(r.tags); setOptions(r); }
      })
      .catch((e) => {
        if (active) setError(describeUiError(e, "spendingRead"));
      });
    return () => {
      active = false;
    };
  }, [draftAccountId, revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelected([]);
    void spendingClient
      .rows(query)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) {
          setError(describeUiError(e, "spendingRead"));
          setResult(undefined);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, revision]);
  async function bulk(tagOnly: boolean) {
    setBusy(true);
    setError(null);
    try {
      await spendingClient.bulkRows({
        ids: selected,
        ...(tagOnly ? { tag: bulkTag || null } : { classification: bulkClass }),
      });
      refresh();
    } catch (e) {
      setError(describeUiError(e, "spendingSave"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="spending-workspace">
      <div className="spending-toolbar">
        <p>{translate("intro")}</p>
        <div className="spending-actions">
          <button
            className="primary-button"
            onClick={() => observeAsync(navigate("/daily-expense/import?" + params.toString()))}
          >
            {admin ? translate("importFiles") : translate("importHistory")}
          </button>
          {admin && (
            <button
              className="secondary-button"
              onClick={() => {
                setRow(undefined);
                setDrawer("row");
              }}
            >
              {translate("addManual")}
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => setDrawer("accounts")}
          >
            {translate("accounts")}
          </button>
        </div>
      </div>
<form onSubmit={event => { event.preventDefault(); filters.apply(); }}><DatePresets onChange={filters.change} /><div className="filter-bar"><label>{cashflow("fromDate")}<input type="date" value={filters.draft.get("from") ?? ""} onChange={e => filters.change({from:e.target.value,month:""})} /></label><label>{cashflow("toDate")}<input type="date" value={filters.draft.get("to") ?? ""} onChange={e => filters.change({to:e.target.value,month:""})} /></label></div>      <div className="filter-bar spending-filters">

        <label>
          {translate("account")}
          <select
            value={filters.draft.get("accountId") ?? ""}
            onChange={(e) => filters.change({ accountId: e.target.value, accountNumberLast4: "", counterpartyAccountLast4: "" })}
          >
            <option value="">{translate("allAccounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("classification")}
          <select
            value={filters.draft.get("classification") ?? ""}
            onChange={(e) => filters.change({ classification: e.target.value })}
          >
            <option value="">{translate("all")}</option>
            {SPENDING_CLASSES.map((c) => (
              <option key={c} value={c}>
                {translate(`classifications.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("tag")}
          <select
            value={
              filters.draft.get("untagged") === "true"
                ? "__untagged"
                : filters.draft.get("tag")
                  ? `tag:${filters.draft.get("tag")}`
                  : ""
            }
            onChange={(e) =>
              filters.change({
                tag: e.target.value.startsWith("tag:")
                  ? e.target.value.slice(4)
                  : "",
                untagged: e.target.value === "__untagged" ? "true" : "",
              })
            }
          >
            <option value="">{translate("allTags")}</option>
            <option value="__untagged">{translate("untagged")}</option>
            {tags.map((t) => (
              <option key={t} value={`tag:${t}`}>
                {t}
              </option>
            ))}
          </select>
        </label>
          <label>
            {translate("descriptionSearch")}
            <input
              value={filters.draft.get("q") ?? ""}
              onChange={(e) => filters.change({ q: e.target.value })}
            />
          </label>
      </div>
      <details className="spending-more-filters"><summary>{translate("moreFilters", { count: ["currency", "accountNumberLast4", "counterpartyAccountLast4", "statementId"].filter(key => q.has(key)).length })}</summary><div className="filter-bar">
        {([ ["accountNumberLast4", translate("ownSuffix")], ["counterpartyAccountLast4", translate("counterpartySuffix")] ] as const).map(([key, label]) => (
          <label key={key}>{label}
            <select value={filters.draft.get(key) ?? ""} onChange={e => filters.change({ [key]: e.target.value })}>
              <option value="">{translate("all")}</option>
              {options[key].map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}
            </select>
          </label>
        ))}

<label>{cashflow("currency")}<select value={filters.draft.get("currency") ?? ""} onChange={e => filters.change({currency:e.target.value})}><option value="">{cashflow("allCurrencies")}</option>{SPENDING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
{filters.draft.get("statementId") && <button type="button" onClick={() => filters.change({statementId:""})}>{translate("clearStatementFilter")}</button>}
</div></details><div className="spending-actions"><button type="submit" className="primary-button">{cashflow("search")}</button><button type="button" onClick={() => filters.apply(true)}>{cashflow("reset")}</button></div></form>
      {error && (
        <p className="form-error" role="alert">
          {translateUiError(error, language)}
        </p>
      )}
      {loading ? (
        <p role="status">{translate("querying")}</p>
      ) : (
        result && (
          <>
            <div className="spending-totals">
              {result.totals.map((t) => (
                <div className="spending-total-line" key={t.currency}>
                  <strong>{t.currency}</strong>
                  <span>
                    {translate("income")} <b>{money(t.income)}</b>
                  </span>
                  <span>
                    {translate("grossSpending")} <b>{money(t.gross_spending)}</b>
                  </span>
                  <span>
                    {translate("refunds")} <b>{money(t.refunds)}</b>
                  </span>
                  <span>
                    {translate("netSpending")} <b>{money(t.net_spending)}</b>
                  </span>
                  <button
                    className="spending-text-button"
                    onClick={() =>
                      filter({ classification: "review", currency: t.currency })
                    }
                  >
                    {translate("pendingRows", { count: t.pending_count })}
                  </button>
                </div>
              ))}
            </div>
            <p className="spending-hint">
              {translate("coverageHint")}
            </p>
            {!!result.rows.length && (
              <SpendingCharts result={result} onFilter={filter} />
            )}
            {admin && (
              <fieldset
                disabled={busy}
                className="spending-actions spending-bulk"
              >
                <span>{translate("selectedRows", { count: selected.length })}</span>
                <select
                  aria-label={translate("bulkClassification")}
                  value={bulkClass}
                  onChange={(e) => setBulkClass(e.target.value)}
                >
                  <option value="">{translate("chooseClassification")}</option>
                  {SPENDING_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {translate(`classifications.${c}`)}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  disabled={!selected.length || !bulkClass}
                  onClick={() => observeAsync(bulk(false))}
                >
                  {translate("applyClassification")}
                </button>
                <input
                  aria-label={translate("bulkTag")}
                  placeholder={translate("tagPlaceholder")}
                  maxLength={80}
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
                <button
                  className="secondary-button"
                  disabled={!selected.length}
                  onClick={() => observeAsync(bulk(true))}
                >
                  {translate("applyTag")}
                </button>
              </fieldset>
            )}
            <div className="table-wrap">
              <table className="spending-table">
                <thead>
                  <tr>
                    {admin && (
                      <th>
                        <input
                          type="checkbox"
                          aria-label={translate("selectAllRows")}
                          checked={
                            !!result.rows.length &&
                            selected.length === result.rows.length
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? result.rows.map((r) => r.id)
                                : [],
                            )
                          }
                        />
                      </th>
                    )}
                    <th>{cashflow("date")}</th>
                    <th>{cashflow("amount")}</th>
                    <th>{translate("account")}</th>
                    <th>{translate("ownSuffix")}</th>
                    <th>{translate("counterparty")}</th>
                    <th>{translate("description")}</th>
                    <th>{translate("classification")}</th>
                    <th>{translate("tag")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id}>
                      {admin && (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={translate("selectRow", { description: r.description })}
                            checked={selected.includes(r.id)}
                            onChange={(e) =>
                              setSelected((old) =>
                                e.target.checked
                                  ? [...old, r.id]
                                  : old.filter((id) => id !== r.id),
                              )
                            }
                          />
                        </td>
                      )}
                      <td>{formatCalendarDate(r.transaction_date, "—", language)}</td>
                      <td className="numeric-cell">
                        {r.currency} {money(r.amount)}
                      </td>
                      <td>{r.account_name}</td>
                      <td>{r.account_number_last4 ?? "—"}</td>
                      <td>{r.counterparty_name ?? "—"}</td>
                      <td>
                        <button
                          className="spending-text-button"
                          onClick={() => {
                            setRow(r);
                            setDrawer("row");
                          }}
                        >
                          {r.description}
                        </button>
                      </td>

                      <td>{translate(`classifications.${r.classification}`)}</td>
                      <td>{r.tag ?? translate("untagged")}</td>
                    </tr>
                  ))}
                  {!result.rows.length && (
                    <tr>
                      <td colSpan={admin ? 9 : 8}>
                        {translate("emptyRows")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={result.pagination}
              loading={loading}
              onPageChange={(offset) =>
                setParams((old) => {
                  const p = new URLSearchParams(old);
                  p.set("offset", String(offset));
                  return p;
                })
              }
            />
          </>
        )
      )}
      {drawer === "accounts" && (
        <SpendingAccountsDrawer
          accounts={accounts}
          admin={admin}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
        />
      )}

      {drawer === "row" && (
        <SpendingRowDrawer
          row={row}
          accounts={accounts}
          tags={tags}
          admin={admin}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
        />
      )}
    </section>
  );
}
