import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getLocalDateString,
  SPENDING_CURRENCIES,
  SPENDING_TYPES,
  SPENDING_TYPE_LABELS,
  type AccountStatement,
  type SpendingAccount,
  type SpendingBreakdown,
  type SpendingQueryResult,
  type StatementRow,
} from "@family-ledger/shared";
import { spendingClient, allSpendingStatements } from "../lib/spendingClient";
import { formatSpendingAmount as formatDisplayAmount } from "../lib/spendingFormat";
import { PaginationControls } from "../components/PaginationControls";
import { SpendingAccountsDrawer } from "../components/spending/SpendingAccountsDrawer";
import { SpendingStatementsDrawer } from "../components/spending/SpendingStatementsDrawer";
import { SpendingRowDrawer } from "../components/spending/SpendingRowDrawer";

export function SpendingPage() {
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState<SpendingAccount[]>([]),
    [statements, setStatements] = useState<AccountStatement[]>([]),
    [admin, setAdmin] = useState(false);
  const [options, setOptions] = useState({
    tags: [] as string[],
    suffixes: [] as string[],
  });
  const [result, setResult] = useState<SpendingQueryResult>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [drawer, setDrawer] = useState<
      "accounts" | "statements" | "row" | null
    >(null),
    [createStatement, setCreateStatement] = useState(false),
    [selectedRow, setSelectedRow] = useState<StatementRow>(),
    [selectedStatement, setSelectedStatement] = useState<string>();
  const query = useMemo(() => {
    const q = new URLSearchParams(params);
    q.delete("tab");
    if (
      !q.has("month") &&
      !q.has("from") &&
      !q.has("to") &&
      !q.has("statementId") &&
      !q.has("allDates")
    )
      q.set("month", getLocalDateString().slice(0, 7));
    q.delete("allDates");
    q.set("limit", "50");
    return q;
  }, [params]);
  const queryString = query.toString();
  function filter(changes: Record<string, string>) {
    setParams((old) => {
      const q = new URLSearchParams(old);
      q.set("tab", "spending");
      q.delete("offset");
      Object.entries(changes).forEach(([k, v]) => {
        if (v) q.set(k, v);
        else q.delete(k);
      });
      return q;
    });
  }
  const refresh = () => setRevision((n) => n + 1);
  useEffect(() => {
    let active = true;
    void Promise.all([spendingClient.accounts(), allSpendingStatements()])
      .then(([a, s]) => {
        if (active) {
          setAccounts(a.accounts);
          setAdmin(a.user.role === "admin");
          setStatements(s);
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
      .options(query.get("accountId") ?? "")
      .then((o) => {
        if (active) setOptions(o);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query.get("accountId"), revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void spendingClient
      .rows(queryString)
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
  }, [queryString, revision]);
  async function addRow(id?: string) {
    if (id && !statements.some((statement) => statement.id === id)) {
      try {
        const statement = await spendingClient.statement(id);
        setStatements((old) => [
          statement,
          ...old.filter((item) => item.id !== id),
        ]);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "无法加载账单。");
        return;
      }
    }
    setSelectedRow(undefined);
    setSelectedStatement(id);
    if (!id && !statements.length) {
      setCreateStatement(true);
      setDrawer("statements");
    } else setDrawer("row");
  }
  return (
    <section className="spending-workspace">
      <div className="spending-toolbar">
        <p>按交易日期查询已录入的消费，结算币种分别汇总。</p>
        <div className="spending-actions">
          {admin && (
            <button className="primary-button" onClick={() => addRow()}>
              新增消费
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => {
              setCreateStatement(false);
              setDrawer("statements");
            }}
          >
            账单管理
          </button>
          <button
            className="secondary-button"
            onClick={() => setDrawer("accounts")}
          >
            消费账户
          </button>
        </div>
      </div>
      <div className="filter-bar spending-filters">
        <label>
          消费月份
          <input
            type="month"
            value={query.get("month") ?? ""}
            onChange={(e) =>
              filter({
                month: e.target.value,
                from: "",
                to: "",
                allDates: e.target.value ? "" : "true",
                statementId: "",
              })
            }
          />
        </label>
        <label>
          账户
          <select
            value={query.get("accountId") ?? ""}
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
          标签
          <select
            value={
              query.get("untagged") === "true"
                ? "__untagged"
                : query.get("tag")
                  ? `tag:${query.get("tag")}`
                  : ""
            }
            onChange={(e) =>
              filter({
                untagged: e.target.value === "__untagged" ? "true" : "",
                tag: e.target.value.startsWith("tag:")
                  ? e.target.value.slice(4)
                  : "",
              })
            }
          >
            <option value="">全部标签</option>
            <option value="__untagged">未分类</option>
            {options.tags.map((t) => (
              <option key={t} value={`tag:${t}`}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          卡号后四位
          <select
            value={query.get("suffixNumber") ?? ""}
            onChange={(e) => filter({ suffixNumber: e.target.value })}
          >
            <option value="">全部卡号</option>
            {options.suffixes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="spending-inclusion-filter">
        计入消费
        <select
          value={query.get("isSpending") ?? ""}
          onChange={(e) => filter({ isSpending: e.target.value })}
        >
          <option value="">全部</option>
          <option value="true">计入消费</option>
          <option value="false">不计入消费</option>
        </select>
      </label>
      <details className="spending-more-filters">
        <summary>更多筛选</summary>
        <div className="filter-bar spending-filters">
          <label>
            交易开始日期
            <input
              type="date"
              value={query.get("from") ?? ""}
              onChange={(e) =>
                filter({ from: e.target.value, month: "", allDates: "true" })
              }
            />
          </label>
          <label>
            交易结束日期
            <input
              type="date"
              value={query.get("to") ?? ""}
              onChange={(e) =>
                filter({ to: e.target.value, month: "", allDates: "true" })
              }
            />
          </label>
          <label>
            账单月份
            <input
              type="month"
              value={query.get("statementMonth") ?? ""}
              onChange={(e) => filter({ statementMonth: e.target.value })}
            />
          </label>
          <label>
            交易类型
            <select
              value={query.get("transactionType") ?? ""}
              onChange={(e) => filter({ transactionType: e.target.value })}
            >
              <option value="">全部类型</option>
              {SPENDING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SPENDING_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            结算币种
            <select
              value={query.get("currency") ?? ""}
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
              value={query.get("q") ?? ""}
              onChange={(e) => filter({ q: e.target.value })}
            />
          </label>
        </div>
      </details>
      <div className="spending-actions">
        <button
          className="secondary-button"
          onClick={() =>
            setParams({
              tab: "spending",
              month: getLocalDateString().slice(0, 7),
            })
          }
        >
          重置筛选
        </button>
        {query.get("statementId") && (
          <span>
            正在查看指定账单{" "}
            <button
              className="spending-text-button"
              onClick={() => filter({ statementId: "" })}
            >
              取消
            </button>
          </span>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">正在查询消费…</p>
      ) : (
        <>
          <div className="spending-totals" aria-live="polite">
            {result?.totals.map((t) => (
              <div className="spending-total-line" key={t.currency}>
                <strong>{t.currency}</strong>
                <span>
                  计入支出 <b>{formatDisplayAmount(t.included_positive)}</b>
                </span>
                <span>
                  计入抵扣 <b>{formatDisplayAmount(t.included_negative)}</b>
                </span>
                <span className="spending-net">
                  净消费 <b>{formatDisplayAmount(t.net_spending)}</b>
                </span>
                {!/^0(?:\.0+)?$/.test(t.excluded_amount) && (
                  <span>
                    不计入消费（净额） {formatDisplayAmount(t.excluded_amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="spending-hint">
            仅统计已开启“计入消费”的明细；计入的负金额会抵扣消费。交易类型不决定是否计入。
            {result?.entering_count
              ? `当前结果涉及 ${result.entering_count} 张录入中的账单，金额可能不完整。`
              : ""}
          </p>
          {!!result?.rows.length && (
            <details className="spending-breakdowns">
              <summary>按月汇总 / 按标签汇总</summary>
              <Breakdown title="按月汇总" rows={result.monthly} />
              <Breakdown title="按标签汇总" rows={result.tags} />
            </details>
          )}
          <div className="table-wrap">
            <table className="spending-table">
              <thead>
                <tr>
                  <th>交易日期</th>
                  <th>交易描述</th>
                  <th>标签</th>
                  <th>卡号后四位</th>
                  <th>原币金额</th>
                  <th>结算金额</th>
                  <th>计入消费</th>
                  <th>类型</th>
                  <th>账户</th>
                  <th>账单月份</th>
                </tr>
              </thead>
              <tbody>
                {result?.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.transaction_date}</td>
                    <td>
                      <button
                        className="spending-text-button"
                        onClick={() => {
                          setSelectedRow(r);
                          setDrawer("row");
                        }}
                      >
                        {r.description}
                      </button>
                    </td>
                    <td>{r.tag ?? "未分类"}</td>
                    <td>{r.suffix_number ?? "—"}</td>
                    <td className="numeric-cell">
                      {r.original_currency}{" "}
                      {formatDisplayAmount(r.original_amount)}
                    </td>
                    <td className="numeric-cell">
                      {r.currency} {formatDisplayAmount(r.settlement_amount)}
                    </td>
                    <td>{r.is_spending ? "是" : "否"}</td>
                    <td>{SPENDING_TYPE_LABELS[r.transaction_type]}</td>
                    <td>{r.account_name}</td>
                    <td>{r.statement_month.slice(0, 7)}</td>
                  </tr>
                ))}
                {!result?.rows.length && (
                  <tr>
                    <td colSpan={10}>没有符合筛选条件的消费明细。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {result && (
            <>
              <p className="spending-hint">
                共 {result.pagination.total} 条明细
              </p>
              <PaginationControls
                pagination={result.pagination}
                loading={loading}
                onPageChange={(offset) =>
                  setParams((old) => {
                    const q = new URLSearchParams(old);
                    q.set("offset", String(offset));
                    return q;
                  })
                }
              />
            </>
          )}
        </>
      )}
      {drawer === "accounts" && (
        <SpendingAccountsDrawer
          accounts={accounts}
          admin={admin}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
        />
      )}
      {drawer === "statements" && (
        <SpendingStatementsDrawer
          accounts={accounts}
          admin={admin}
          create={createStatement}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
          onAddRow={(id) => addRow(id)}
          onViewRows={(id) => {
            setParams({ tab: "spending", statementId: id });
            setDrawer(null);
          }}
        />
      )}
      {drawer === "row" && (
        <SpendingRowDrawer
          row={selectedRow}
          statementId={selectedStatement}
          statements={statements}
          tags={options.tags}
          admin={admin}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
          onCreateStatement={() => {
            setCreateStatement(true);
            setDrawer("statements");
          }}
        />
      )}
    </section>
  );
}
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: SpendingBreakdown[];
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{title === "按月汇总" ? "月份" : "标签"}</th>
              <th>币种</th>
              <th>笔数</th>
              <th>净消费</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.label ?? "未分类"}</td>
                <td>{r.currency}</td>
                <td>{r.count}</td>
                <td>{formatDisplayAmount(r.net_spending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
