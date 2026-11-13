import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../../i18n/LanguageProvider";
import { getUiLanguage, i18n } from "../../i18n/instance";
import { describeStatementError, formatStatementRowError, formatStatementWarnings, translateStatementError, type StatementAction, type StatementError } from "../../i18n/statementMessages";
import { LoadingState } from "../LoadingState";
import { useEventCallback } from "../../lib/useEventCallback";
import { commitStatementWithRecovery, isDefinitiveStatementRejection, type StatementCommitAttempt } from "../../lib/statementCommit";
import { observeAsync } from "../../lib/observeAsync";
import { useEffect, useRef, useState } from "react";
import {
  SPENDING_CLASSES,
  SPENDING_ENCODINGS,
  type AccountStatement,
  type SpendingAccount,
  type SpendingClass,
  type SpendingEncoding,
  type SpendingImportDecision,
  type StatementListResult,
} from "@family-ledger/shared";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useWorkflowDeparture } from "../../lib/useWorkflowDeparture";
import { PaginationControls } from "../PaginationControls";
import { spendingClient } from "../../lib/spendingClient";
import { formatCalendarDate, formatLocalDateTimeNote } from "../../lib/timeFormat";
type StatementNotice = { kind: "cancelled" } | { kind: "completed"; batch: AccountStatement };
export function SpendingImportWorkspace({
  accounts,
  admin,
  onSaved,
  onViewRows,
}: {
  accounts: SpendingAccount[];
  admin: boolean;
  onSaved: () => void;
  onViewRows: (id: string) => void;
}) {
  const { t } = useTranslation("spendingImport");
  const { t: tSpending } = useTranslation("spending");
  const { language } = useUiLanguage();
  const currentText = () => i18n.getFixedT(getUiLanguage(), "spendingImport");
  const localDate = (value: string) => formatCalendarDate(value, "—", language);
  const localTime = (value: string) => formatLocalDateTimeNote(value, "—", language);
  const importCounts = (record: AccountStatement) => {
    const counts = {
      imported: record.imported_count,
      skipped: record.skipped_count,
      rejected: record.rejected_count,
      remaining: record.row_count,
    };
    return record.total_count === null
      ? t("countsUnparsed", counts)
      : t("counts", { ...counts, total: record.total_count });
  };
  const importedRange = (record: AccountStatement) => record.date_from && record.date_to
    ? t("savedRange", { from: localDate(record.date_from), to: localDate(record.date_to) })
    : t("noSavedRange");
  const { statementId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const commitAttempt = useRef<StatementCommitAttempt | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const internalNavigation = useRef(false);
  const loadedId = useRef<string | undefined>(undefined);
  const baselineChoices = useRef("");
  const [list, setList] = useState<StatementListResult>(),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [batch, setBatch] = useState<AccountStatement>(),
    [account, setAccount] = useState(
      accounts.find((a) => a.is_active)?.id ?? "",
    ),
    [file, setFile] = useState<File>(),
    [encoding, setEncoding] = useState<SpendingEncoding | "">("");
  const [key, setKey] = useState(""),
    [choices, setChoices] = useState<SpendingImportDecision[]>([]),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<StatementError | null>(null),
    [message, setMessage] = useState<StatementNotice | null>(null);
  useEffect(() => {
    let active = true;
    void spendingClient
      .statements(`limit=20&offset=${offset}`)
      .then((r) => {
        if (active) setList(r);
      })
      .catch((e) => {
        if (active) setError(describeStatementError(e, "read"));
      });
    return () => {
      active = false;
    };
  }, [offset, revision]);
  const hasUnsavedInput = !!file || (batch?.status === "preview" && JSON.stringify(choices) !== baselineChoices.current);
  useWorkflowDeparture(uncertain || hasUnsavedInput, busy, internalNavigation);
  const select = useEventCallback(function(b: AccountStatement, updateRoute = true) {
    if (b.status !== "preview" || b.id !== commitAttempt.current?.id) { commitAttempt.current = null; setUncertain(false); }
    loadedId.current = b.id;
    baselineChoices.current = JSON.stringify((b.preview?.rows ?? []).map(r => ({ row_number: r.row_number, classification: r.classification, tag: r.tag, skip: r.duplicate_count > 0, allow_duplicate: false })));
    if (updateRoute) { internalNavigation.current = true; observeAsync(navigate('/daily-expense/import/' + b.id + '?' + params.toString(), { replace: true })); internalNavigation.current = false; }
    setBatch(b);
    setAccount(b.account_id);
    setKey(b.csv_file_key ?? "");
    setEncoding(b.encoding ?? "");
    setFile(undefined);
    setPage(0);
    setChoices(
      (b.preview?.rows ?? []).map((r) => ({
        row_number: r.row_number,
        classification: r.classification,
        tag: r.tag,
        skip: r.duplicate_count > 0,
        allow_duplicate: false,
      })),
    );
  });
  useEffect(() => {
    if (!statementId) { if (loadedId.current) { loadedId.current = undefined; setBatch(undefined); setKey(""); setFile(undefined); setChoices([]); commitAttempt.current = null; setUncertain(false); } return; }
    if (loadedId.current === statementId) return;
    let active = true;
    setBusy(true); setBatch(undefined); setError(null);
    spendingClient.statement(statementId).then(b => { if (active) select(b, false); })
      .catch(e => { if (active) setError(describeStatementError(e, "read")); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [statementId, select]);
  async function act(work: () => Promise<void>, action: StatementAction = "save") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setError(describeStatementError(e, action));
    } finally {
      setBusy(false);
    }
  }
  function refreshed() {
    setRevision((n) => n + 1);
    onSaved();
  }
  async function preview() {
    let b = batch;
    if (!b || !["draft", "preview"].includes(b.status)) {
      b = await spendingClient.createBatch(account);
      setBatch(b); loadedId.current = b.id;
      internalNavigation.current = true; observeAsync(navigate("/daily-expense/import/" + b.id + "?" + params.toString(), { replace: true })); internalNavigation.current = false;
    }
    let k = key;
    if (file) {
      k = await spendingClient.uploadCsv(b.id, file);
      setKey(k);
      setFile(undefined);
    }
    if (!k) { setError({ kind: "local", key: "csvRequired" }); return; }
    select(await spendingClient.preview(b.id, k, encoding || undefined));
    refreshed();
  }
  function update(index: number, change: Partial<SpendingImportDecision>) {
    if (commitAttempt.current) return;
    setChoices((old) =>
      old.map((d, i) => (i === index ? { ...d, ...change } : d)),
    );
  }
  async function openSource(kind: "pdf" | "csv") {
    if (!batch) return;
    const url = await (kind === "pdf"
      ? spendingClient.pdfUrl(batch.id)
      : spendingClient.csvUrl(batch.id));
    window.open(url, "_blank", "noopener,noreferrer");
  }
  const fileDates = batch?.status === "preview" ? batch.preview?.rows.map((row) => row.transaction_date).sort() : undefined;
  const firstFileDate = fileDates?.[0];
  const lastFileDate = fileDates?.at(-1);
  if (statementId && !batch) return <section>{error ? <><p role="alert" className="form-error">{translateStatementError(error, language)}</p><p>{t("batchMissingHint")}</p><button type="button" className="secondary-button" onClick={() => { internalNavigation.current = true; observeAsync(navigate("/daily-expense/import?" + params.toString(), { replace: true })); internalNavigation.current = false; }}>{t("newImport")}</button></> : <LoadingState label={t("loadingBatch")} />}</section>;
  return (
    <section className="import-workspace" aria-label={t("workspace")}>
      <ol className="workflow-steps" aria-label={t("progress")}><li aria-current={!batch || batch.status === "draft" ? "step" : undefined}>{t("uploadStep")}</li><li aria-current={batch?.status === "preview" ? "step" : undefined}>{t("reviewStep")}</li><li aria-current={batch?.status === "committed" ? "step" : undefined}>{t("resultStep")}</li></ol>
      {error && (
        <p role="alert" className="form-error">
          {translateStatementError(error, language)}
        </p>
      )}
      {message && <p role="status">{message.kind === "completed" ? t("completed", { counts: importCounts(message.batch) }) : t("cancelNotice")}</p>}
      {batch && !busy && !uncertain ? <button type="button" className="secondary-button" onClick={() => observeAsync(act(async () => { if (hasUnsavedInput && !window.confirm(currentText()("reloadPrompt"))) return; select(await spendingClient.statement(batch.id)); }, "read"))}>{t("reload")}</button> : null}
      {batch?.status === "preview" && Date.parse(batch.expires_at) <= Date.now() ? <p role="alert" className="form-warning">{t("expired")}</p> : null}
      {uncertain && !busy ? <p role="alert" className="form-warning">{t("uncertain")}</p> : null}
      <fieldset disabled={busy || uncertain} className="spending-form">
        {admin && (
          <>
            <button
              className="secondary-button"
              onClick={() => {
                if ((file || batch?.status === "preview") && !window.confirm(currentText()("newPrompt"))) return;
                loadedId.current = undefined;
                internalNavigation.current = true; observeAsync(navigate('/daily-expense/import?' + params.toString(), { replace: true })); internalNavigation.current = false;
                setBatch(undefined);
                setKey("");
                setFile(undefined);
                setChoices([]);
                setEncoding("");
              }}
            >
              {t("newImport")}
            </button>
            <label>
              {t("account")}
              <select
                disabled={!!batch}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">{t("chooseAccount")}</option>
                {accounts
                  .filter((a) => a.is_active || a.id === account)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.default_currency}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {admin && (!batch || ["draft", "preview"].includes(batch.status)) && (
          <>
            <label>
              {t("csvField")}
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setChoices([]);
                }}
              />
            </label>
            <label>
              {t("encoding")}
              <select
                value={encoding}
                onChange={(e) => {
                  setEncoding(e.target.value as SpendingEncoding | "");
                  setChoices([]);
                }}
              >
                <option value="">{t("detect")}</option>
                {SPENDING_ENCODINGS.map((e) => (
                  <option key={e} value={e}>
                    {e === "gb18030" ? "GB18030 / GBK" : e.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={!account || (!file && !key)}
              onClick={() => observeAsync(act(preview, "preview"))}
            >
              {t("preview")}
            </button>
            <p className="spending-hint">
              {t("bankHint")}
            </p>
          </>
        )}
        {batch && (
          <>
            <p>
              {batch.csv_file_name ?? t("attachmentRecord")} · {t(`status.${batch.status}`)}{" "}
              · {batch.encoding?.toUpperCase()}
            </p>
            <p className="spending-hint">
              {t("createdAt", { time: localTime(batch.created_at) })}
            </p>
            <p className="spending-hint">{importedRange(batch)}</p>
            {firstFileDate && lastFileDate ? <p className="spending-hint">{t("fileRange", { from: localDate(firstFileDate), to: localDate(lastFileDate) })}</p> : null}
            <p>
              {importCounts(batch)}
            </p>
            <div className="spending-actions">
              {admin && ["draft", "preview"].includes(batch.status) && (
                <button className="secondary-button" onClick={() => observeAsync(act(async () => {
                  if (!window.confirm(currentText()("cancelPrompt"))) return;
                  select(await spendingClient.cancel(batch.id));
                  setKey(""); setFile(undefined); setChoices([]);
                  setMessage({ kind: "cancelled" }); refreshed();
                }))}>{t("cancel")}</button>
              )}
              {admin && batch.csv_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => observeAsync(act(() => openSource("csv"), "read"))}
                >
                  {t("downloadCsv")}
                </button>
              )}
              {admin && batch.source_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => observeAsync(act(() => openSource("pdf"), "read"))}
                >
                  {t("openPdf")}
                </button>
              )}
              {batch.status === "committed" && (
                <button
                  className="secondary-button"
                  onClick={() => onViewRows(batch.id)}
                >
                  {t("viewRows")}
                </button>
              )}
              {admin && batch.status === "committed" && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    observeAsync(act(async () => {
                      const current = await spendingClient.statement(batch.id);
                      if (
                        !window.confirm(
                          currentText()("undoPrompt", { rows: current.row_count, edited: current.edited_count }),
                        )
                      )
                        return;
                      await spendingClient.undo(
                        batch.id,
                        current.edited_count > 0,
                      );
                      select(await spendingClient.statement(batch.id));
                      refreshed();
                    }, "undo"))
                  }
                >
                  {t("undo")}
                </button>
              )}
            </div>
          </>
        )}
        {admin && batch?.status !== "cancelled" && (
          <label>
            {t("pdfField")}
            <input
              type="file"
              accept=".pdf"
              disabled={!account}
              onChange={(e) => {
                const pdf = e.target.files?.[0];
                e.target.value = "";
                if (pdf)
                  observeAsync(act(async () => {
                    const b =
                      batch ??
                      (await spendingClient.createBatch(account, true));
                    await spendingClient.uploadPdf(b.id, pdf);
                    select(await spendingClient.statement(b.id));
                    refreshed();
                  }, "attachment"));
              }}
            />
          </label>
        )}
        {admin && batch?.status !== "cancelled" && batch?.source_file_key && (
          <button
            className="secondary-button"
            onClick={() =>
              observeAsync(act(async () => {
                if (!window.confirm(currentText()("removePdfPrompt")))
                  return;
                await spendingClient.removePdf(batch.id);
                select(await spendingClient.statement(batch.id));
                refreshed();
              }, "attachment"))
            }
          >
            {t("removePdf")}
          </button>
        )}
      </fieldset>
      {batch?.status === "preview" && batch.preview && (
        <>
          <p>
            {t("previewSummary", { rows: batch.preview.rows.length, errors: batch.preview.errors.length })}
          </p>
          {batch.preview.warnings.length > 0 && (
            <details>
              <summary>{t("warnings", { count: batch.preview.warnings.length })}</summary>
              {formatStatementWarnings(batch.preview, language).map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          )}
          {batch.preview.errors.length > 0 && (
            <div role="alert">
              {t("fixCsv")}
              {batch.preview.errors.map((e) => (
                <p key={e.row_number}>
                  {formatStatementRowError(e, language)}
                </p>
              ))}
            </div>
          )}
          <p className="spending-hint">{t("scrollHint")}</p>
          <div className="table-wrap spending-preview-scroll" role="region" aria-label={t("previewTable")} tabIndex={0}>
            <table className="spending-table">
              <thead>
                <tr>
                  <th>{t("colImport")}</th>
                  <th>{t("colDate")}</th>
                  <th>{t("colSuffix")}</th>
                  <th>{t("colCounterparty")}</th>
                  <th>{t("colDescription")}</th>
                  <th>{t("colAmount")}</th>
                  <th>{t("colClass")}</th>
                  <th>{t("colTag")}</th>
                </tr>
              </thead>
              <tbody>
                {batch.preview.rows
                  .slice(page * 50, page * 50 + 50)
                  .map((r, j) => {
                    const i = page * 50 + j,
                      d = choices[i];
                    return (
                      <tr key={r.row_number}>
                        <td>
                          {d && (
                            <input
                              aria-label={t("chooseRow", { row: r.row_number })}
                              type="checkbox"
                              disabled={!admin || busy || uncertain || batch.status !== "preview"}
                              checked={!d.skip}
                              onChange={(e) =>
                                update(i, {
                                  skip: !e.target.checked,
                                  allow_duplicate:
                                    r.duplicate_count > 0 && e.target.checked,
                                })
                              }
                            />
                          )}{" "}
                          {r.duplicate_count > 0 &&
                            t("duplicateCount", { count: r.duplicate_count })}
                        </td>
                        <td>
                          {localDate(r.transaction_date)}
                          <br />{t("record", { row: r.row_number })}
                        </td>
                        <td>{r.account_number_last4 ?? "—"}</td>
                        <td>{r.counterparty_name ?? "—"}</td>
                        <td>{r.description}</td>
                        <td>{r.amount}</td>
                        <td>
                          {d ? (
                            <select
                              aria-label={t("rowClass", { row: r.row_number })}
                              disabled={!admin || busy || uncertain || batch.status !== "preview"}
                              value={d.classification}
                              onChange={(e) =>
                                update(i, {
                                  classification: e.target
                                    .value as SpendingClass,
                                })
                              }
                            >
                              {SPENDING_CLASSES.map((c) => (
                                <option key={c} value={c}>
                                  {tSpending(`classifications.${c}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            tSpending(`classifications.${r.classification}`)
                          )}
                        </td>
                        <td>
                          {d && (
                            <input
                              aria-label={t("rowTag", { row: r.row_number })}
                              maxLength={80}
                              disabled={!admin || busy || uncertain || batch.status !== "preview"}
                              value={d.tag ?? ""}
                              onChange={(e) =>
                                update(i, { tag: e.target.value || null })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <PaginationControls pagination={{ limit: 50, offset: page * 50, total: batch.preview.rows.length, hasMore: (page + 1) * 50 < batch.preview.rows.length }} loading={busy} onPageChange={offset => setPage(offset / 50)} />
          {admin && batch.status === "preview" && (
            <div className="workflow-actions import-confirm-actions"><p>{t("confirmSummary", { kept: choices.filter(choice => !choice.skip).length, skipped: choices.filter(choice => choice.skip).length, errors: batch.preview.errors.length })}</p><button
              className="primary-button"
              disabled={
                busy ||
                !!batch.preview.errors.length ||
                !choices.length ||
                choices.length !== batch.preview.rows.length ||
                !batch.preview_token || (!uncertain && Date.parse(batch.expires_at) <= Date.now())
              }
              onClick={() =>
                observeAsync(act(async () => {
                  commitAttempt.current ??= { id: batch.id, token: batch.preview_token!, decisions: choices.map(choice => ({ ...choice })) };
                  setUncertain(true);
                  let committed: AccountStatement;
                  try { committed = await commitStatementWithRecovery(commitAttempt.current, spendingClient.commit, spendingClient.statement); }
                  catch (failure) {
                    if (isDefinitiveStatementRejection(failure)) { commitAttempt.current = null; setUncertain(false); }
                    throw failure;
                  }
                  select(committed);
                  setMessage({ kind: "completed", batch: committed });
                  refreshed();
                }, "commit"))
              }
            >
              {uncertain ? t("retryCommit") : t("confirm", { count: choices.filter((c) => !c.skip).length })}
            </button></div>
          )}
        </>
      )}
      <h3>{t("history")}</h3>
      <div className="spending-account-list">
        {list?.statements.map((b) => (
          <button
            className="secondary-button"
            disabled={busy || uncertain}
            key={b.id}
            onClick={() =>
              observeAsync(act(async () => { if (hasUnsavedInput && !window.confirm(currentText()("discardPrompt"))) return; select(await spendingClient.statement(b.id)); }, "read"))
            }
          >
            {b.account_name} ·{" "}
            {b.csv_file_name ?? b.source_file_name ?? t("status.draft")} ·{" "}
            {t(`status.${b.status}`)}
            <br />{importedRange(b)}
            <br />{importCounts(b)}
            <br />
            {localTime(b.created_at)}
          </button>
        ))}
      </div>
      {list && (
        <PaginationControls
          pagination={list.pagination}
          loading={busy}
          onPageChange={setOffset}
        />
      )}
    </section>
  );
}
