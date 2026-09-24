import { useEffect, useState } from "react";
import {
  SPENDING_CURRENCIES,
  getLocalDateString,
  type SpendingAccount,
  type AccountStatement,
  type StatementListResult,
} from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { PaginationControls } from "../PaginationControls";
import { spendingClient } from "../../lib/spendingClient";
interface Props {
  accounts: SpendingAccount[];
  admin: boolean;
  create?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAddRow: (id: string) => void;
  onViewRows: (id: string) => void;
}
function emptyForm(accounts: SpendingAccount[]) {
  const today = getLocalDateString(),
    a = accounts.find((x) => x.is_active);
  return {
    account_id: a?.id ?? "",
    statement_date: today,
    period_start: today.slice(0, 7) + "-01",
    period_end: today,
    currency: a?.default_currency ?? "CNY",
    notes: "",
  };
}
export function SpendingStatementsDrawer({
  accounts,
  admin,
  create,
  onClose,
  onSaved,
  onAddRow,
  onViewRows,
}: Props) {
  const [editing, setEditing] = useState(!!create),
    [current, setCurrent] = useState<AccountStatement>(),
    [form, setForm] = useState(() => emptyForm(accounts));
  const [result, setResult] = useState<StatementListResult>(),
    [filters, setFilters] = useState({
      accountId: "",
      month: "",
      status: "",
      offset: 0,
    }),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (editing) return;
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      ...filters,
      offset: String(filters.offset),
      limit: "20",
    });
    void spendingClient
      .statements(query.toString())
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editing, filters, revision]);
  function open(statement: AccountStatement) {
    setCurrent(statement);
    setForm({
      account_id: statement.account_id,
      statement_date: statement.statement_date,
      period_start: statement.period_start,
      period_end: statement.period_end,
      currency: statement.currency,
      notes: statement.notes ?? "",
    });
    setEditing(true);
    setError("");
  }
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      setRevision((n) => n + 1);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await action(async () => {
      const statement = await spendingClient.saveStatement(form, current?.id);
      open(statement);
    });
  }
  async function viewPdf() {
    if (!current) return;
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    await action(async () => {
      try {
        const url = await spendingClient.pdfUrl(current.id);
        if (tab) tab.location.href = url;
        else throw new Error("请允许浏览器打开 PDF 新窗口。");
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  }
  const field = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const title = editing ? (current ? "账单详情" : "新建账单") : "账单管理";
  return (
    <Drawer
      open
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        editing ? (
          <div className="spending-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setCurrent(undefined);
                setError("");
              }}
            >
              返回账单列表
            </button>
            {admin && (
              <button
                className="primary-button"
                disabled={busy || !form.account_id}
                onClick={() => void save()}
              >
                保存账单
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!editing ? (
        <>
          {admin && (
            <button
              className="primary-button"
              onClick={() => {
                setForm(emptyForm(accounts));
                setCurrent(undefined);
                setEditing(true);
              }}
            >
              新建账单
            </button>
          )}
          <div className="spending-form">
            <label>
              账户
              <select
                value={filters.accountId}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    accountId: e.target.value,
                    offset: 0,
                  })
                }
              >
                <option value="">全部账户</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              账单月份
              <input
                type="month"
                value={filters.month}
                onChange={(e) =>
                  setFilters({ ...filters, month: e.target.value, offset: 0 })
                }
              />
            </label>
            <label>
              录入状态
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value, offset: 0 })
                }
              >
                <option value="">全部</option>
                <option value="entering">录入中</option>
                <option value="complete">已完成</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>账户 / 月份</th>
                  <th>账单周期</th>
                  <th>结算币种</th>
                  <th>明细</th>
                  <th>状态 / 附件</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  result?.statements.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="spending-text-button"
                          onClick={() => open(s)}
                        >
                          {s.account_name}
                          <br />
                          {s.month.slice(0, 7)}
                        </button>
                      </td>
                      <td>
                        {s.period_start}
                        <br />
                        {s.period_end}
                      </td>
                      <td>{s.currency}</td>
                      <td>{s.row_count}</td>
                      <td>
                        {s.status === "complete" ? "已完成" : "录入中"}
                        {s.source_file_key ? " · PDF" : ""}
                      </td>
                    </tr>
                  ))}
                {(loading || !result?.statements.length) && (
                  <tr>
                    <td colSpan={5}>{loading ? "加载中…" : "暂无账单。"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {result && (
            <PaginationControls
              pagination={result.pagination}
              loading={loading}
              onPageChange={(offset) => setFilters({ ...filters, offset })}
            />
          )}
        </>
      ) : (
        <>
          {!accounts.some((a) => a.is_active) && !current && (
            <p>请先在“消费账户”中添加或启用一个账户。</p>
          )}
          {current && (
            <>
              <p>
                {current.status === "complete" ? "已完成录入" : "录入中"} ·{" "}
                {current.row_count} 条明细
              </p>
              <div className="spending-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => onViewRows(current.id)}
                >
                  查看明细
                </button>
                {admin && (
                  <>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => onAddRow(current.id)}
                    >
                      新增消费
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const s = await spendingClient.saveStatement(
                            {
                              status:
                                current.status === "complete"
                                  ? "entering"
                                  : "complete",
                            },
                            current.id,
                          );
                          setCurrent(s);
                        })
                      }
                    >
                      {current.status === "complete"
                        ? "重新录入"
                        : "标记录入完成"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <fieldset disabled={!admin || busy} className="spending-form">
            <label>
              消费账户
              <select
                disabled={!!current?.row_count}
                value={form.account_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    account_id: e.target.value,
                    currency:
                      accounts.find((a) => a.id === e.target.value)
                        ?.default_currency ?? "CNY",
                  })
                }
              >
                <option value="">请选择账户</option>
                {accounts
                  .filter((a) => a.is_active || a.id === form.account_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              账单日期
              <input
                type="date"
                value={form.statement_date}
                onChange={(e) => field("statement_date", e.target.value)}
              />
            </label>
            <label>
              周期开始
              <input
                type="date"
                value={form.period_start}
                onChange={(e) => field("period_start", e.target.value)}
              />
            </label>
            <label>
              周期结束
              <input
                type="date"
                value={form.period_end}
                onChange={(e) => field("period_end", e.target.value)}
              />
            </label>
            <label>
              结算币种
              <select
                disabled={!!current?.row_count}
                value={form.currency}
                onChange={(e) => field("currency", e.target.value)}
              >
                {SPENDING_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              备注
              <textarea
                value={form.notes}
                onChange={(e) => field("notes", e.target.value)}
              />
            </label>
          </fieldset>
          {current && (
            <>
              <h3>原始 PDF</h3>
              <p className="spending-hint">
                仅保存附件，不自动提取消费明细。最大 10 MiB。
              </p>
              {current.source_file_name && (
                <p className="spending-filename">{current.source_file_name}</p>
              )}
              <div className="spending-actions">
                {current.source_file_key && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void viewPdf()}
                  >
                    查看 PDF
                  </button>
                )}
                {admin && (
                  <>
                    {current.source_file_key && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("移除此账单的 PDF 关联？"))
                            void action(async () => {
                              await spendingClient.removePdf(current.id);
                              setCurrent(
                                await spendingClient.statement(current.id),
                              );
                            });
                        }}
                      >
                        移除附件
                      </button>
                    )}
                    <label className="secondary-button spending-upload">
                      {current.source_file_key ? "替换 PDF" : "上传 PDF"}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file)
                            void action(async () => {
                              await spendingClient.uploadPdf(current.id, file);
                              setCurrent(
                                await spendingClient.statement(current.id),
                              );
                            });
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
              {busy && <p role="status">正在处理…</p>}
              {admin && (
                <button
                  className="secondary-button spending-delete"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `删除此账单及其 ${current.row_count} 条明细？此操作无法撤销。`,
                      )
                    )
                      void action(async () => {
                        await spendingClient.deleteStatement(current.id);
                        setCurrent(undefined);
                        setEditing(false);
                      });
                  }}
                >
                  删除账单及明细
                </button>
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
