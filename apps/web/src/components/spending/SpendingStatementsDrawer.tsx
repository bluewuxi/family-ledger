import { useEffect, useState } from "react";
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
import { Drawer } from "../Drawer";
import { PaginationControls } from "../PaginationControls";
import { spendingClient } from "../../lib/spendingClient";
import { formatLocalDateTimeNote } from "../../lib/timeFormat";
const statusLabels = {
  draft: "待上传",
  preview: "待确认",
  committed: "已导入",
  undone: "已撤销",
  document: "PDF 附件",
};
export function SpendingStatementsDrawer({
  accounts,
  admin,
  onClose,
  onSaved,
  onViewRows,
}: {
  accounts: SpendingAccount[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onViewRows: (id: string) => void;
}) {
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
    [error, setError] = useState("");
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
  function select(b: AccountStatement) {
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
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
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
      setBatch(b);
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
  return (
    <Drawer
      open
      title="导入与附件"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="spending-form">
        {admin && (
          <>
            <button
              className="secondary-button"
              onClick={() => {
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
              onClick={() => void act(preview)}
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
            <p>
              已导入 {batch.imported_count} 条，跳过 {batch.skipped_count}{" "}
              条，目前保留 {batch.row_count} 条。
            </p>
            <div className="spending-actions">
              {batch.csv_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => void act(() => openSource("csv"))}
                >
                  下载原 CSV
                </button>
              )}
              {batch.source_file_key && (
                <button
                  className="secondary-button"
                  onClick={() => void act(() => openSource("pdf"))}
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
                    void act(async () => {
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
                    })
                  }
                >
                  撤销导入
                </button>
              )}
            </div>
          </>
        )}
        {admin && (
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
                  void act(async () => {
                    const b =
                      batch ??
                      (await spendingClient.createBatch(account, true));
                    await spendingClient.uploadPdf(b.id, pdf);
                    select(await spendingClient.statement(b.id));
                    refreshed();
                  });
              }}
            />
          </label>
        )}
        {admin && batch?.source_file_key && (
          <button
            className="secondary-button"
            onClick={() =>
              void act(async () => {
                if (!window.confirm("移除此 PDF 附件链接？源文件仍保留。"))
                  return;
                await spendingClient.removePdf(batch.id);
                select(await spendingClient.statement(batch.id));
                refreshed();
              })
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
          <div className="table-wrap">
            <table className="spending-table">
              <thead>
                <tr>
                  <th>导入</th>
                  <th>日期 / 原始行</th>
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
                              disabled={!admin || busy}
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
                        <td>{r.description}</td>
                        <td>{r.amount}</td>
                        <td>
                          {d ? (
                            <select
                              aria-label={`第 ${r.row_number} 行统计归类`}
                              disabled={!admin || busy}
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
                              disabled={!admin || busy}
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
          <div className="spending-actions">
            <button
              className="secondary-button"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>第 {page + 1} 页</span>
            <button
              className="secondary-button"
              disabled={(page + 1) * 50 >= batch.preview.rows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
          {admin && (
            <button
              className="primary-button"
              disabled={
                busy ||
                !!batch.preview.errors.length ||
                !choices.length ||
                choices.length !== batch.preview.rows.length ||
                !batch.preview_token
              }
              onClick={() =>
                void act(async () => {
                  select(
                    await spendingClient.commit(
                      batch.id,
                      batch.preview_token!,
                      choices,
                    ),
                  );
                  refreshed();
                })
              }
            >
              确认导入 {choices.filter((c) => !c.skip).length} 条
            </button>
          )}
        </>
      )}
      <h3>导入记录</h3>
      <div className="spending-account-list">
        {list?.statements.map((b) => (
          <button
            className="secondary-button"
            disabled={busy}
            key={b.id}
            onClick={() =>
              void act(async () => select(await spendingClient.statement(b.id)))
            }
          >
            {b.account_name} ·{" "}
            {b.csv_file_name ?? b.source_file_name ?? "待上传"} ·{" "}
            {statusLabels[b.status]}
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
    </Drawer>
  );
}
