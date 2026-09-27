import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SPENDING_CLASSES,
  SPENDING_CLASS_LABELS,
  SPENDING_CURRENCIES,
  type SpendingAccount,
  type SpendingQueryResult,
  type StatementRow,
} from "@family-ledger/shared";
import { spendingClient } from "../lib/spendingClient";
import { formatSpendingAmount as money } from "../lib/spendingFormat";
import { PaginationControls } from "../components/PaginationControls";
import { SpendingAccountsDrawer } from "../components/spending/SpendingAccountsDrawer";
import { SpendingStatementsDrawer } from "../components/spending/SpendingStatementsDrawer";
import { SpendingRowDrawer } from "../components/spending/SpendingRowDrawer";
import { SpendingCharts } from "../components/spending/SpendingCharts";
export function SpendingPage() {
  const [params, setParams] = useSearchParams(),
    [accounts, setAccounts] = useState<SpendingAccount[]>([]),
    [admin, setAdmin] = useState(false),
    [tags, setTags] = useState<string[]>([]);
  const [result, setResult] = useState<SpendingQueryResult>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [drawer, setDrawer] = useState<"accounts" | "imports" | "row" | null>(
      null,
    ),
    [row, setRow] = useState<StatementRow>(),
    [selected, setSelected] = useState<string[]>([]),
    [bulkClass, setBulkClass] = useState(""),
    [bulkTag, setBulkTag] = useState("");
  const q = new URLSearchParams(params);
  q.delete("tab");
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
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    void spendingClient
      .options(params.get("accountId") ?? "")
      .then((r) => {
        if (active) setTags(r.tags);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [params.get("accountId"), revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected([]);
    void spendingClient
      .rows(query)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
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
    setError("");
    try {
      await spendingClient.bulkRows({
        ids: selected,
        ...(tagOnly ? { tag: bulkTag || null } : { classification: bulkClass }),
      });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量修改失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="spending-workspace">
      <div className="spending-toolbar">
        <p>银行交易、收入与消费。不同币种分别统计。</p>
        <div className="spending-actions">
          <button
            className="primary-button"
            onClick={() => setDrawer("imports")}
          >
            {admin ? "导入 CSV / PDF" : "导入记录"}
          </button>
          {admin && (
            <button
              className="secondary-button"
              onClick={() => {
                setRow(undefined);
                setDrawer("row");
              }}
            >
              手动新增
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => setDrawer("accounts")}
          >
            收支账户
          </button>
        </div>
      </div>
      <div className="filter-bar spending-filters">
        <label>
          交易月份
          <input
            type="month"
            value={q.get("month") ?? ""}
            onChange={(e) =>
              filter({ month: e.target.value, from: "", to: "" })
            }
          />
        </label>
        <label>
          账户
          <select
            value={q.get("accountId") ?? ""}
            onChange={(e) => filter({ accountId: e.target.value })}
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
          统计归类
          <select
            value={q.get("classification") ?? ""}
            onChange={(e) => filter({ classification: e.target.value })}
          >
            <option value="">全部</option>
            {SPENDING_CLASSES.map((c) => (
              <option key={c} value={c}>
                {SPENDING_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          标签
          <select
            value={
              q.get("untagged") === "true"
                ? "__untagged"
                : q.get("tag")
                  ? `tag:${q.get("tag")}`
                  : ""
            }
            onChange={(e) =>
              filter({
                tag: e.target.value.startsWith("tag:")
                  ? e.target.value.slice(4)
                  : "",
                untagged: e.target.value === "__untagged" ? "true" : "",
              })
            }
          >
            <option value="">全部标签</option>
            <option value="__untagged">未分类</option>
            {tags.map((t) => (
              <option key={t} value={`tag:${t}`}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="spending-more-filters">
        <summary>日期范围、币种与搜索</summary>
        <div className="filter-bar spending-filters">
          <label>
            开始日期
            <input
              type="date"
              value={q.get("from") ?? ""}
              onChange={(e) => filter({ from: e.target.value, month: "" })}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={q.get("to") ?? ""}
              onChange={(e) => filter({ to: e.target.value, month: "" })}
            />
          </label>
          <label>
            币种
            <select
              value={q.get("currency") ?? ""}
              onChange={(e) => filter({ currency: e.target.value })}
            >
              <option value="">全部币种</option>
              {SPENDING_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            描述关键词
            <input
              value={q.get("q") ?? ""}
              onChange={(e) => filter({ q: e.target.value })}
            />
          </label>
        </div>
      </details>
      <div className="spending-actions">
        <button
          className="secondary-button"
          onClick={() => setParams({ tab: "spending" })}
        >
          清除筛选
        </button>
        {q.get("statementId") && (
          <button
            className="secondary-button"
            onClick={() => filter({ statementId: "" })}
          >
            取消指定导入筛选
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">正在查询交易…</p>
      ) : (
        result && (
          <>
            <div className="spending-totals">
              {result.totals.map((t) => (
                <div className="spending-total-line" key={t.currency}>
                  <strong>{t.currency}</strong>
                  <span>
                    收入 <b>{money(t.income)}</b>
                  </span>
                  <span>
                    消费 <b>{money(t.gross_spending)}</b>
                  </span>
                  <span>
                    退款 <b>{money(t.refunds)}</b>
                  </span>
                  <span>
                    净消费 <b>{money(t.net_spending)}</b>
                  </span>
                  <button
                    className="spending-text-button"
                    onClick={() =>
                      filter({ classification: "review", currency: t.currency })
                    }
                  >
                    待确认 {t.pending_count} 条
                  </button>
                </div>
              ))}
            </div>
            <p className="spending-hint">
              仅统计已录入并归类的交易。转账和待确认记录不计入收入或消费；退款按发生月份抵扣。导出日期范围不代表数据完整。
            </p>
            {!!result.rows.length && (
              <SpendingCharts result={result} onFilter={filter} />
            )}
            {admin && (
              <fieldset
                disabled={busy}
                className="spending-actions spending-bulk"
              >
                <span>已选 {selected.length} 条</span>
                <select
                  aria-label="批量统计归类"
                  value={bulkClass}
                  onChange={(e) => setBulkClass(e.target.value)}
                >
                  <option value="">选择归类</option>
                  {SPENDING_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {SPENDING_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  disabled={!selected.length || !bulkClass}
                  onClick={() => void bulk(false)}
                >
                  应用归类
                </button>
                <input
                  aria-label="批量标签"
                  placeholder="标签（留空清除）"
                  maxLength={80}
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
                <button
                  className="secondary-button"
                  disabled={!selected.length}
                  onClick={() => void bulk(true)}
                >
                  应用标签
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
                          aria-label="选择本页全部交易"
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
                    <th>日期</th>
                    <th>账户</th>
                    <th>描述</th>
                    <th>金额</th>
                    <th>统计归类</th>
                    <th>标签</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id}>
                      {admin && (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${r.description}`}
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
                      <td>{r.transaction_date}</td>
                      <td>{r.account_name}</td>
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
                      <td className="numeric-cell">
                        {r.currency} {money(r.amount)}
                      </td>
                      <td>{SPENDING_CLASS_LABELS[r.classification]}</td>
                      <td>{r.tag ?? "未分类"}</td>
                    </tr>
                  ))}
                  {!result.rows.length && (
                    <tr>
                      <td colSpan={admin ? 7 : 6}>
                        没有符合条件的已录入交易。
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
      {drawer === "imports" && (
        <SpendingStatementsDrawer
          accounts={accounts}
          admin={admin}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
          onViewRows={(id) => {
            setParams({ tab: "spending", statementId: id });
            setDrawer(null);
          }}
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
