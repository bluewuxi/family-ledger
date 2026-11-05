import { LoadingState } from "../LoadingState";
import { useEventCallback } from "../../lib/useEventCallback";
import { commitStatementWithRecovery, isDefinitiveStatementRejection, type StatementCommitAttempt } from "../../lib/statementCommit";
import { observeAsync } from "../../lib/observeAsync";
import { useEffect, useRef, useState } from "react";
import {
  SPENDING_CLASSES,
  SPENDING_CLASS_LABELS,
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
import { formatLocalDateTimeNote } from "../../lib/timeFormat";
const statusLabels = {
  draft: "待上传",
  cancelled: "已取消",
  preview: "待确认",
  committed: "已导入",
  undone: "已撤销",
  document: "PDF 附件",
};
function importCounts(batch: AccountStatement) {
  return `已导入 ${batch.imported_count} / ${batch.total_count === null ? "总记录待解析" : "总记录 " + batch.total_count}，跳过 ${batch.skipped_count} 条，错误 ${batch.rejected_count} 条，目前保留 ${batch.row_count} 条。`;
}
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
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void spendingClient
      .statements(`limit=20&offset=${offset}`)
      .then((r) => {
        if (active) setList(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
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
    setBusy(true); setBatch(undefined); setError("");
    spendingClient.statement(statementId).then(b => { if (active) select(b, false); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "导入记录不可用。"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [statementId, select]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
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
    if (!k) throw new Error("请选择 CSV 文件。");
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
  if (statementId && !batch) return <section>{error ? <><p role="alert" className="form-error">{error}</p><p>导入记录不可用，请返回家庭收支重新选择记录，或新建导入。</p><button type="button" className="secondary-button" onClick={() => { internalNavigation.current = true; observeAsync(navigate("/daily-expense/import?" + params.toString(), { replace: true })); internalNavigation.current = false; }}>新建导入</button></> : <LoadingState label="正在加载导入记录" />}</section>;
  return (
    <section className="import-workspace" aria-label="账单导入工作区">
      <ol className="workflow-steps" aria-label="导入进度"><li aria-current={!batch || batch.status === "draft" ? "step" : undefined}>1 上传文件</li><li aria-current={batch?.status === "preview" ? "step" : undefined}>2 核对预览</li><li aria-current={batch?.status === "committed" ? "step" : undefined}>3 导入结果</li></ol>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {batch && !busy && !uncertain ? <button type="button" className="secondary-button" onClick={() => observeAsync(act(async () => { if (hasUnsavedInput && !window.confirm("重新加载将放弃未保存的文件或预览修改，确定继续？")) return; select(await spendingClient.statement(batch.id)); }))}>重新加载导入记录</button> : null}
      {batch?.status === "preview" && Date.parse(batch.expires_at) <= Date.now() ? <p role="alert" className="form-warning">预览已过期，请重新预览后确认。</p> : null}
      {uncertain && !busy ? <p role="alert" className="form-warning">尚未确认导入结果。已保留原预览与选择，可重试同一次确认；请勿新建导入。</p> : null}
      <fieldset disabled={busy || uncertain} className="spending-form">
        {admin && (
          <>
            <button
              className="secondary-button"
              onClick={() => {
                if ((file || batch?.status === "preview") && !window.confirm("放弃当前预览并新建导入？")) return;
                loadedId.current = undefined;
                internalNavigation.current = true; observeAsync(navigate('/daily-expense/import?' + params.toString(), { replace: true })); internalNavigation.current = false;
                setBatch(undefined);
                setKey("");
                setFile(undefined);
                setChoices([]);
                setEncoding("");
              }}
            >
              新建导入
            </button>
            <label>
              账户
              <select
                disabled={!!batch}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">请选择账户</option>
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
              CSV 文件（最大 2 MiB）
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
              字符编码
              <select
                value={encoding}
                onChange={(e) => {
                  setEncoding(e.target.value as SpendingEncoding | "");
                  setChoices([]);
                }}
              >
                <option value="">自动识别</option>
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
              onClick={() => observeAsync(act(preview))}
            >
              预览导入
            </button>
            <p className="spending-hint">
              建行：年月日（YYYYMMDD）。BNZ：日/月/年（DD/MM/YY，2000–2099）。预览有效期
              24 小时，确认前请核对日期和中文。
            </p>
          </>
        )}
        {batch && (
          <>
            <p>
              {batch.csv_file_name ?? "附件记录"} · {statusLabels[batch.status]}{" "}
              · {batch.encoding?.toUpperCase()}
            </p>
            <p className="spending-hint">
              创建于 {formatLocalDateTimeNote(batch.created_at, "—")}
            </p>
            <p className="spending-hint">本次导入交易日期范围：{batch.date_from && batch.date_to ? batch.date_from + " 至 " + batch.date_to : "暂无已导入交易"}</p>
            {batch.status === "preview" && batch.preview?.rows.length ? <p className="spending-hint">文件交易日期范围：{batch.preview.rows.map(r => r.transaction_date).sort()[0]} 至 {batch.preview.rows.map(r => r.transaction_date).sort().at(-1)}</p> : null}
            <p>
              {importCounts(batch)}
            </p>
            <div className="spending-actions">
              {admin && ["draft", "preview"].includes(batch.status) && (
                <button className="secondary-button" onClick={() => observeAsync(act(async () => {
                  if (!window.confirm("取消这次导入？导入历史会保留。")) return;
                  select(await spendingClient.cancel(batch.id));
                  setKey(""); setFile(undefined); setChoices([]);
                  setMessage("导入已取消。"); refreshed();
                }))}>取消导入</button>
              )}
              {admin && batch.csv_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => observeAsync(act(() => openSource("csv")))}
                >
                  下载原 CSV
                </button>
              )}
              {admin && batch.source_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => observeAsync(act(() => openSource("pdf")))}
                >
                  查看 PDF
                </button>
              )}
              {batch.status === "committed" && (
                <button
                  className="secondary-button"
                  onClick={() => onViewRows(batch.id)}
                >
                  查看交易
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
                          `撤销这次导入的 ${current.row_count} 条交易？其中 ${current.edited_count} 条导入后已修改。源文件及导入记录会保留。`,
                        )
                      )
                        return;
                      await spendingClient.undo(
                        batch.id,
                        current.edited_count > 0,
                      );
                      select(await spendingClient.statement(batch.id));
                      refreshed();
                    }))
                  }
                >
                  撤销导入
                </button>
              )}
            </div>
          </>
        )}
        {admin && batch?.status !== "cancelled" && (
          <label>
            添加 PDF 附件（可单独保存，不解析内容）
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
                  }));
              }}
            />
          </label>
        )}
        {admin && batch?.status !== "cancelled" && batch?.source_file_key && (
          <button
            className="secondary-button"
            onClick={() =>
              observeAsync(act(async () => {
                if (!window.confirm("移除此 PDF 附件链接？源文件仍保留。"))
                  return;
                await spendingClient.removePdf(batch.id);
                select(await spendingClient.statement(batch.id));
                refreshed();
              }))
            }
          >
            移除 PDF 链接
          </button>
        )}
      </fieldset>
      {batch?.status === "preview" && batch.preview && (
        <>
          <p>
            识别 {batch.preview.rows.length} 条交易，
            {batch.preview.errors.length}{" "}
            条错误。重复候选默认跳过；相同金额的真实交易可以保留。
          </p>
          {batch.preview.warnings.length > 0 && (
            <details>
              <summary>查看导入提示（{batch.preview.warnings.length}）</summary>
              {batch.preview.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          )}
          {batch.preview.errors.length > 0 && (
            <div role="alert">
              请修正原 CSV 后重新上传。
              {batch.preview.errors.map((e) => (
                <p key={e.row_number}>
                  第 {e.row_number} 行：{e.message}
                </p>
              ))}
            </div>
          )}
          <p className="spending-hint">左右滚动表格可查看统计归类和标签；上下滚动可查看其余交易。</p>
          <div className="table-wrap spending-preview-scroll" role="region" aria-label="导入交易预览，可横向滚动" tabIndex={0}>
            <table className="spending-table">
              <thead>
                <tr>
                  <th>导入</th>
                  <th>日期 / 原始行</th>
                  <th>本方账号后四位</th>
                  <th>对方户名</th>
                  <th>描述</th>
                  <th>金额</th>
                  <th>统计归类</th>
                  <th>标签</th>
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
                              aria-label={`导入第 ${r.row_number} 行`}
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
                            `已有 ${r.duplicate_count} 条相同候选`}
                        </td>
                        <td>
                          {r.transaction_date}
                          <br />第 {r.row_number} 行
                        </td>
                        <td>{r.account_number_last4 ?? "—"}</td>
                        <td>{r.counterparty_name ?? "—"}</td>
                        <td>{r.description}</td>
                        <td>{r.amount}</td>
                        <td>
                          {d ? (
                            <select
                              aria-label={`第 ${r.row_number} 行统计归类`}
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
                                  {SPENDING_CLASS_LABELS[c]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            SPENDING_CLASS_LABELS[r.classification]
                          )}
                        </td>
                        <td>
                          {d && (
                            <input
                              aria-label={`第 ${r.row_number} 行标签`}
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
            <div className="workflow-actions import-confirm-actions"><p>保留 {choices.filter(choice => !choice.skip).length} 条 · 跳过 {choices.filter(choice => choice.skip).length} 条 · 错误 {batch.preview.errors.length} 条</p><button
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
                  setMessage(`导入完成。${importCounts(committed)}`);
                  refreshed();
                }))
              }
            >
              {uncertain ? "重试本次确认" : `确认导入 ${choices.filter((c) => !c.skip).length} 条`}
            </button></div>
          )}
        </>
      )}
      <h3>导入记录</h3>
      <div className="spending-account-list">
        {list?.statements.map((b) => (
          <button
            className="secondary-button"
            disabled={busy || uncertain}
            key={b.id}
            onClick={() =>
              observeAsync(act(async () => { if (hasUnsavedInput && !window.confirm("放弃未保存的文件或预览修改？")) return; select(await spendingClient.statement(b.id)); }))
            }
          >
            {b.account_name} ·{" "}
            {b.csv_file_name ?? b.source_file_name ?? "待上传"} ·{" "}
            {statusLabels[b.status]}
            <br />本次导入交易日期范围：{b.date_from && b.date_to ? b.date_from + " 至 " + b.date_to : "暂无已导入交易"}
            <br />{importCounts(b)}
            <br />
            {formatLocalDateTimeNote(b.created_at, "—")}
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
