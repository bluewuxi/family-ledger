import { useUiLanguage } from "../i18n/LanguageProvider";
import { i18n } from "../i18n/instance";
import type { UiLanguage } from "../i18n/language";
import { getDisplayLocale } from "../i18n/language";
import { getInvestmentLabel } from "../i18n/investmentLabels";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { translateMonthlySummaryWarning, translateSnapshotWarning } from "../i18n/investmentWarnings";
import { formatCalendarDate } from "../lib/timeFormat";
import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Printer, RefreshCw, RotateCcw, Save } from "lucide-react";
import {
  formatDateTimeInTimeZone,
  getAppBusinessDate,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type AuthenticatedUser,
  type InvestmentTransaction,
  type MonthlyCashAdjustmentSummary,
  type MonthlyReview,
  type MonthlyReviewStatus,
  type MonthlySummary,
  type MonthlyTradeActivitySummary,
  type SnapshotDisplayCurrency,
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { apiGet, apiPatch } from "../lib/apiClient";
import { formatDisplayAmount, formatSignedDisplayAmount, formatSignedDisplayPercent } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface MonthlySummaryResponse {
  user: AuthenticatedUser;
  monthlySummary: MonthlySummary;
}

interface MonthlyReviewResponse {
  user: AuthenticatedUser;
  monthlyReview: MonthlyReview;
}

const monthlySummaryCurrencyStorageKey = "family-ledger.monthly-summary.reportingCurrency";
const bridgeLabelKeys = { start_value: "startAssets", asset_change: "assetChange", net_principal_flow: "principal", cash_adjustment: "adjustment", valuation_movement: "movement", end_value: "endAssets" } as const;
type GainColorScheme = Parameters<typeof signedToneClass>[1];

export function MonthlySummaryPage() {
  const { language } = useUiLanguage();
  const t = i18n.getFixedT(language, "monthlyReview");
  const { preferences, loading: preferencesLoading } = usePreferences();
  const maxSelectableMonth = getAppBusinessDate().slice(0, 7);
  const [month, setMonth] = useState(() => maxSelectableMonth);
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [review, setReview] = useState<MonthlyReview | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState("");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingReview, setSavingReview] = useState(false);
  const [error, setError] = useState<UiErrorDescriptor | { key: "futureMonth" } | null>(null);
  const [reviewMessage, setReviewMessage] = useState<"completed" | "reopened" | "saved" | null>(null);

const loadMonthlySummary = useEventCallback(async function(selectedMonth: string, currency: SnapshotDisplayCurrency) {
    setLoading(true);
    setError(null);
    setReviewMessage(null);

    if (selectedMonth > maxSelectableMonth) {
      setError({ key: "futureMonth" });
      setLoading(false);
      return;
    }

    try {
      const query = new URLSearchParams({ month: selectedMonth, currency });
      const reviewQuery = new URLSearchParams({ month: selectedMonth });
      const [summaryData, reviewData] = await Promise.all([
        apiGet<MonthlySummaryResponse>(`/reports/monthly-summary?${query.toString()}`),
        apiGet<MonthlyReviewResponse>(`/reports/monthly-review?${reviewQuery.toString()}`)
      ]);
      setUser(summaryData.user);
      setSummary(summaryData.monthlySummary);
      setReview(reviewData.monthlyReview);
      setReviewNotesDraft(reviewData.monthlyReview.familyNotes);
    } catch (requestError) {
      setError(describeUiError(requestError, "investmentRead"));
    } finally {
      setLoading(false);
    }
  });
  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(monthlySummaryCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (currencyInitialized) {
      observeAsync(loadMonthlySummary(month, reportingCurrency));
    }
  }, [currencyInitialized, month, reportingCurrency, loadMonthlySummary]);

async function saveReview(nextStatus?: MonthlyReviewStatus) {
    if (nextStatus === "complete" && dataNeedsAttention) {
      const confirmed = window.confirm(t("confirmComplete"));
      if (!confirmed) {
        return;
      }
    }

    setSavingReview(true);
    setError(null);
    setReviewMessage(null);

    try {
      const query = new URLSearchParams({ month });
      const data = await apiPatch<MonthlyReviewResponse>(`/reports/monthly-review?${query.toString()}`, {
        familyNotes: reviewNotesDraft,
        ...(nextStatus ? { reviewStatus: nextStatus } : {})
      });
      setUser(data.user);
      setReview(data.monthlyReview);
      setReviewNotesDraft(data.monthlyReview.familyNotes);
      setReviewMessage(nextStatus === "complete" ? "completed" : nextStatus === "in_progress" ? "reopened" : "saved");
    } catch (requestError) {
      setError(describeUiError(requestError, "monthlyReviewSave"));
    } finally {
      setSavingReview(false);
    }
  }

  const pageLoading = loading || !currencyInitialized;
  const activeCurrency = summary?.currency ?? reportingCurrency;
  const bridgeLines = summary?.bridgeLines ?? [];
  const warningMessages = useMemo(() => unique((summary?.warnings ?? []).map(warning => translateMonthlySummaryWarning(warning, language))), [summary?.warnings, language]);
  const snapshotWarningMessages = useMemo(
    () => unique((summary?.snapshotWarnings ?? []).map(warning => translateSnapshotWarning(warning, language))),
    [summary?.snapshotWarnings, language]
  );
  const dataNeedsAttention = warningMessages.length > 0 || snapshotWarningMessages.length > 0;
  const isAdmin = user?.role === "admin";
  const reviewStatus = review?.reviewStatus ?? "in_progress";

  return (
    <section className="monthly-report-page">
      <p className="monthly-print-title">{i18n.getFixedT(language, "common")("productName")} {t("title")}</p>
      <header className="page-header account-header">
        <div className="monthly-title-area">
          <div className="monthly-title-row">
            <PageTitle route="/reports/monthly-summary">{t("title")}</PageTitle>
            <label className="monthly-title-month">
              {t("month")}
              <input
                type="month"
                value={month}
                max={maxSelectableMonth}
                onChange={(event) => setMonth(event.target.value)}
                disabled={pageLoading}
              />
            </label>
          </div>
          <p>{t("subtitle")}</p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label={t("currency")}
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
              writeStoredDisplayCurrency(monthlySummaryCurrencyStorageKey, nextCurrency);
              setCurrencyManuallySelected(true);
              setReportingCurrency(nextCurrency);
            }}
            disabled={!currencyInitialized}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => observeAsync(loadMonthlySummary(month, reportingCurrency))}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>{t("refresh")}</span>
          </button>
          <button className="secondary-button print-hidden" type="button" onClick={() => window.print()} disabled={pageLoading}>
            <Printer size={17} aria-hidden="true" />
            <span>{t("print")}</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error.key === "futureMonth" ? t("futureMonth") : translateUiError(error, language)}</p> : null}
      {reviewMessage ? <p className="form-success print-hidden">{t(reviewMessage)}</p> : null}

      <div className="metric-grid monthly-summary-metrics">
        {[
          { label: t("startAssets"), value: summary?.startValue, signed: false },
          { label: t("endAssets"), value: summary?.endValue, signed: false },
          { label: t("assetChange"), value: summary?.assetChange, signed: true },
          { label: t("principal"), value: summary?.netPrincipalFlow, signed: true },
          { label: t("adjustment"), value: summary?.cashAdjustmentImpact, signed: true },
          { label: t("movement"), value: summary?.valuationMovement, signed: true }
         ].map((metric, index) => (
          <article className="metric-card" key={index}>
            <span>{metric.label}</span>
            <small className="metric-currency">
              <CurrencyFlagIcon currency={activeCurrency} />
              {activeCurrency}
            </small>
            <strong className={metric.signed ? signedToneClass(metric.value, preferences.gainColorScheme, 3) : undefined}>
              {formatWholeMetric(metric.value, pageLoading, metric.signed, language)}
            </strong>
          </article>
        ))}
      </div>

      {summary ? (
        <p className="quote-update-note">
          {t("snapshotRange")}{formatCalendarDate(summary.startSnapshotDate, t("missingStart"), language)} {t("to")} {formatCalendarDate(summary.endSnapshotDate, t("missingEnd"), language)}
          {summary.requestedStartSnapshotDate && summary.requestedEndSnapshotDate ? t("requestedBoundaries", { start: formatCalendarDate(summary.requestedStartSnapshotDate,"-",language), end: formatCalendarDate(summary.requestedEndSnapshotDate,"-",language) }) : ""}
          {summary.fullPeriodAvailable === false ? t("incomplete") : ""}
        </p>
      ) : null}

      <section className="flow-card monthly-review-workflow">
        <div className="monthly-review-header">
          <div>
            <h2>{t("review")}</h2>
            <p>{t("reviewHelp")}</p>
          </div>
          <div className="monthly-review-statuses">
            <span className={`status-pill ${dataNeedsAttention ? "status-pill-paused" : "status-pill-active"}`}>
              {t("dataStatus")}{pageLoading ? t("loading") : dataNeedsAttention ? t("attention") : t("healthy")}
            </span>
            <span className={`status-pill ${reviewStatus === "complete" ? "status-pill-active" : ""}`}>
              {t("reviewStatus")}{reviewStatus === "complete" ? t("complete") : t("inProgress")}
            </span>
          </div>
        </div>
        <label className="monthly-review-notes">
          {t("notes")}
          <textarea
            value={reviewNotesDraft}
            onChange={(event) => setReviewNotesDraft(event.target.value)}
            readOnly={!isAdmin || pageLoading}
            placeholder={t("notesHint")}
          />
        </label>
        <div className="monthly-review-footer">
          <p className="readonly-note">
            {isAdmin ? t("adminHelp") : t("viewerHelp")}
            {review?.updatedAt ? t("lastSaved", { time: formatReviewTimestamp(review.updatedAt, language) }) : ""}
          </p>
          {isAdmin ? (
            <div className="monthly-review-actions print-hidden">
              <button className="secondary-button" type="button" onClick={() => observeAsync(saveReview())} disabled={pageLoading || savingReview}>
                <Save size={17} aria-hidden="true" />
                <span>{t("saveNotes")}</span>
              </button>
              {reviewStatus === "complete" ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => observeAsync(saveReview("in_progress"))}
                  disabled={pageLoading || savingReview}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  <span>{t("reopen")}</span>
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => observeAsync(saveReview("complete"))}
                  disabled={pageLoading || savingReview}
                >
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <span>{t("markComplete")}</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("bridge")}</h2>
              <p>{t("bridgeHelp")}</p>
            </div>
          </div>
          <div className="table-wrap compact-table-wrap monthly-bridge-wrap">
            <table className="monthly-bridge-table">
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th className="numeric-cell">{t("amountPrefix")}{activeCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <LoadingRow colSpan={2} label={t("loadingReview")} />
                ) : bridgeLines.length === 0 ? (
                  <EmptyRow colSpan={2} label={t("emptyReview")} />
                ) : (
                  bridgeLines.map((line) => {
                    const signed = line.key !== "start_value" && line.key !== "end_value";
                    return (
                      <tr key={line.key}>
                        <td>{t(bridgeLabelKeys[line.key])}</td>
                        <td className={`numeric-cell ${signed ? signedToneClass(line.amount, preferences.gainColorScheme, 3) : ""}`}>
                          {formatBridgeLineAmount(line, false, signed, language)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("principalDetails")}</h2>
              <p>{t("principalHelp")}</p>
            </div>
          </div>
          <PrincipalFlowTable
            loading={pageLoading}
            transactions={summary?.principalTransactions ?? []}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>
      </section>

      <section className="monthly-single-panel">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("contributions")}</h2>
              <p>{t("contributionHelp")}</p>
            </div>
          </div>
          <div className="table-wrap compact-table-wrap monthly-account-contribution-wrap">
            <table className="monthly-account-contribution-table">
              <thead>
                <tr>
                  <th>{t("account")}</th>
                  <th className="numeric-cell">{t("start")}</th>
                  <th className="numeric-cell">{t("end")}</th>
                  <th className="numeric-cell">{t("principal")}</th>
                  <th className="numeric-cell">{t("adjustment")}</th>
                  <th className="numeric-cell">{t("movement")}</th>
                  <th className="numeric-cell">{t("contribution")}</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <LoadingRow colSpan={7} label={t("loadingContributions")} />
                ) : (summary?.accountChanges.length ?? 0) === 0 ? (
                  <EmptyRow colSpan={7} label={t("emptyContributions")} />
                ) : (
                  summary?.accountChanges.map((account) => (
                    <tr key={account.accountId}>
                      <td>{account.accountName}</td>
                      <td className="numeric-cell">{formatMetric(account.startValue, false, false, language)}</td>
                      <td className="numeric-cell">{formatMetric(account.endValue, false, false, language)}</td>
                      <td className={`numeric-cell ${signedToneClass(account.netPrincipalFlow, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.netPrincipalFlow, false, true, language)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.cashAdjustmentImpact, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.cashAdjustmentImpact, false, true, language)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.valuationMovement, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.valuationMovement, false, true, language)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.valuationContributionPct, preferences.gainColorScheme, 3)}`}>
                        {account.valuationContributionPct === null ? "--" : `${formatSignedDisplayPercent(account.valuationContributionPct, getDisplayLocale(language))}%`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("trades")}</h2>
              <p>{t("tradesHelp")}</p>
            </div>
          </div>
          <TradeActivityTable
            loading={pageLoading}
            trades={summary?.tradeActivity ?? []}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>

        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("adjustmentDetails")}</h2>
              <p>{t("adjustmentHelp")}</p>
            </div>
          </div>
          <CashAdjustmentTable
            loading={pageLoading}
            adjustments={summary?.cashAdjustments ?? []}
            currency={activeCurrency}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>{t("warnings")}</h2>
              <p>{t("warningsHelp")}</p>
            </div>
          </div>
          {pageLoading ? (
            <LoadingState label={t("loadingWarnings")} />
          ) : warningMessages.length === 0 && snapshotWarningMessages.length === 0 ? (
            <p className="readonly-note">{t("noWarnings")}</p>
          ) : (
            <div className="monthly-warning-list">
              {[...warningMessages, ...snapshotWarningMessages].map((message, index) => (
                <p className="form-warning" key={index}>{message}</p>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

function formatReviewTimestamp(value: string, language: UiLanguage = "zh-CN"): string {
  return formatDateTimeInTimeZone(value, Intl.DateTimeFormat().resolvedOptions().timeZone, getDisplayLocale(language), value);
}

function TradeActivityTable({
  loading,
  trades,
  gainColorScheme
}: {
  loading: boolean;
  trades: MonthlyTradeActivitySummary[];
  gainColorScheme: GainColorScheme;
}) {
  const { language } = useUiLanguage();
  const t = i18n.getFixedT(language, "monthlyReview");
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">{t("date")}</th>
            <th className="type-column">{t("type")}</th>
            <th>{t("instrument")}</th>
            <th className="numeric-cell">{t("price")}</th>
            <th className="numeric-cell">{t("settlement")}</th>
            <th>{t("transactionNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={6} label={t("loadingTrades")} />
          ) : trades.length === 0 ? (
            <EmptyRow colSpan={6} label={t("noTrades")} />
          ) : (
            trades.map((item) => (
              <tr key={item.transaction.id}>
                <td className="date-column">{formatMonthDay(item.transaction.tradeDate, language)}</td>
                <td className="type-column">{getInvestmentLabel("transactionType", item.transaction.transactionType, language)}</td>
                <td>{formatInstrument(item.transaction, language)}</td>
                <td className="numeric-cell">{formatTransactionPrice(item.transaction, language)}</td>
                <td className={`numeric-cell ${signedToneClass(getLinkedCashLegSignedAmount(item.linkedCashLeg), gainColorScheme, 3)}`}>
                  {formatLinkedCashLeg(item.linkedCashLeg, language)}
                </td>
                <td>{item.transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CashAdjustmentTable({
  loading,
  adjustments,
  currency,
  gainColorScheme
}: {
  loading: boolean;
  adjustments: MonthlyCashAdjustmentSummary[];
  currency: SnapshotDisplayCurrency;
  gainColorScheme: GainColorScheme;
}) {
  const { language } = useUiLanguage();
  const t = i18n.getFixedT(language, "monthlyReview");
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">{t("date")}</th>
            <th>{t("instrument")}</th>
            <th className="numeric-cell">{t("adjustmentPrefix")}{currency})</th>
            <th>{t("transactionNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={4} label={t("loadingAdjustments")} />
          ) : adjustments.length === 0 ? (
            <EmptyRow colSpan={4} label={t("noAdjustments")} />
          ) : (
            adjustments.map((item) => (
              <tr key={item.transaction.id}>
                <td className="date-column">{formatMonthDay(item.transaction.tradeDate, language)}</td>
                <td>{formatInstrument(item.transaction, language)}</td>
                <td className={`numeric-cell ${signedToneClass(item.signedAmount, gainColorScheme, 3)}`}>
                  {formatMetric(item.signedAmount, false, true, language)}
                </td>
                <td>{item.transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PrincipalFlowTable({
  loading,
  transactions,
  gainColorScheme
}: {
  loading: boolean;
  transactions: InvestmentTransaction[];
  gainColorScheme: GainColorScheme;
}) {
  const { language } = useUiLanguage();
  const t = i18n.getFixedT(language, "monthlyReview");
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">{t("date")}</th>
            <th className="type-column">{t("type")}</th>
            <th>{t("instrument")}</th>
            <th className="numeric-cell">{t("amount")}</th>
            <th>{t("transactionNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={5} label={t("loadingPrincipal")} />
          ) : transactions.length === 0 ? (
            <EmptyRow colSpan={5} label={t("noPrincipal")} />
          ) : (
            transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td className="date-column">{formatMonthDay(transaction.tradeDate, language)}</td>
                <td className="type-column">{getInvestmentLabel("transactionType", transaction.transactionType, language)}</td>
                <td>{formatInstrument(transaction, language)}</td>
                <td className={`numeric-cell ${signedToneClass(getPrincipalSignedDisplayAmount(transaction), gainColorScheme, 3)}`}>
                  {formatPrincipalAmount(transaction, language)}
                </td>
                <td>{transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="table-loading-cell" colSpan={colSpan}>
        <LoadingState label={label} />
      </td>
    </tr>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function formatMetric(value: string | null | undefined, loading: boolean, signed: boolean, language: UiLanguage = "zh-CN"): ReactNode {
  const t = i18n.getFixedT(language, "monthlyReview");
  if (loading) {
    return <LoadingState label={t("loading")} />;
  }

  if (value === null || value === undefined) {
    return "--";
  }

  return signed ? formatSignedDisplayAmount(value, getDisplayLocale(language)) : formatDisplayAmount(value, getDisplayLocale(language));
}

function formatBridgeLineAmount(
  line: MonthlySummary["bridgeLines"][number],
  loading: boolean,
  signed: boolean, language: UiLanguage = "zh-CN"
): ReactNode {
  return line.key === "cash_adjustment"
    ? formatMetric(line.amount, loading, signed, language)
    : formatWholeMetric(line.amount, loading, signed, language);
}

function formatWholeMetric(value: string | null | undefined, loading: boolean, signed: boolean, language: UiLanguage = "zh-CN"): ReactNode {
  const t = i18n.getFixedT(language, "monthlyReview");
  if (loading) {
    return <LoadingState label={t("loading")} />;
  }

  if (value === null || value === undefined) {
    return "--";
  }

  const numericValue = Number(String(value).trim());
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  const roundedValue = Math.round(numericValue);
  const normalizedValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
  const formatted = Math.abs(normalizedValue).toLocaleString(getDisplayLocale(language), { maximumFractionDigits: 0 });

  if (!signed) {
    return normalizedValue < 0 ? `-${formatted}` : formatted;
  }

  if (normalizedValue > 0) {
    return `+${formatted}`;
  }

  return normalizedValue < 0 ? `-${formatted}` : formatted;
}

function formatTransactionPrice(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  return transaction.price ? `${transaction.currency} ${formatDisplayAmount(transaction.price, getDisplayLocale(language))}` : "--";
}

function getLinkedCashLegSignedAmount(transaction: InvestmentTransaction | null): string | null {
  if (!transaction || !transaction.grossAmount) {
    return null;
  }

  return transaction.transactionType === "withdrawal" ? `-${transaction.grossAmount}` : transaction.grossAmount;
}

function formatLinkedCashLeg(transaction: InvestmentTransaction | null, language: UiLanguage = "zh-CN"): string {
  if (!transaction || !transaction.grossAmount) {
    return "--";
  }

  const sign = transaction.transactionType === "withdrawal" ? "-" : "+";
  return `${sign}${transaction.currency} ${formatDisplayAmount(transaction.grossAmount, getDisplayLocale(language))}`;
}

function getPrincipalSignedDisplayAmount(transaction: InvestmentTransaction): string | null {
  if (!transaction.grossAmount) {
    return null;
  }

  return transaction.transactionType === "withdrawal" ? `-${transaction.grossAmount}` : transaction.grossAmount;
}

function formatPrincipalAmount(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  const amount = transaction.grossAmount;

  if (!amount) {
    return "--";
  }

  const sign = transaction.transactionType === "withdrawal" ? "-" : "+";
  return `${sign}${transaction.currency} ${formatDisplayAmount(amount, getDisplayLocale(language))}`;
}

function formatMonthDay(value: string, language: UiLanguage = "zh-CN"): string {
  return language === "en" ? formatCalendarDate(value, "-", language) : value.length >= 10 ? value.slice(5, 10) : value;
}

function formatInstrument(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  return formatInstrumentName(transaction.instrumentSymbol, transaction.instrumentShortName, transaction.instrumentName, language);
}

function formatInstrumentName(symbol: string | null | undefined, shortName: string | null | undefined, name: string | null | undefined, language: UiLanguage = "zh-CN"): string {
  const t = i18n.getFixedT(language, "monthlyReview");
  const displayName = shortName ?? name ?? t("unknownInstrument");
  return symbol ? `${symbol} - ${displayName}` : displayName;
}

function toDisplayCurrency(value: string): SnapshotDisplayCurrency {
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(value as SnapshotDisplayCurrency)
    ? (value as SnapshotDisplayCurrency)
    : "CNY";
}

function readStoredDisplayCurrency(key: string): SnapshotDisplayCurrency | null {
  const value = window.localStorage.getItem(key);
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(value as SnapshotDisplayCurrency)
    ? (value as SnapshotDisplayCurrency)
    : null;
}

function writeStoredDisplayCurrency(key: string, value: SnapshotDisplayCurrency): void {
  window.localStorage.setItem(key, value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
