import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_DIRECTION_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type AdjustmentDirection,
  type AuthenticatedUser,
  type CreateInvestmentTransactionInput,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type Pagination,
  type TransactionType
} from "@family-ledger/shared";
import { Drawer } from "../components/Drawer";
import { PaginationControls } from "../components/PaginationControls";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";
import { formatDisplayAmount } from "../lib/numberFormat";

interface TransactionsResponse {
  user: AuthenticatedUser;
  transactions: InvestmentTransaction[];
  pagination: Pagination;
}

interface AccountsResponse {
  accounts: InvestmentAccount[];
}

interface InstrumentsResponse {
  instruments: Instrument[];
}

interface TransactionResponse {
  transaction: InvestmentTransaction;
}

interface DeleteTransactionResponse {
  deleted: boolean;
}

interface TransactionFormState {
  accountId: string;
  instrumentId: string;
  transactionType: TransactionType;
  tradeDate: string;
  settlementDate: string;
  quantity: string;
  price: string;
  grossAmount: string;
  fee: string;
  tax: string;
  adjustmentDirection: AdjustmentDirection;
  notes: string;
}

interface TransactionFilters {
  from: string;
  to: string;
  accountId: string;
  instrumentId: string;
  transactionType: "" | TransactionType;
}

const today = new Date().toISOString().slice(0, 10);
const pageSize = 20;
const emptyPagination: Pagination = { limit: pageSize, offset: 0, hasMore: false };
const emptyFilters: TransactionFilters = { from: "", to: "", accountId: "", instrumentId: "", transactionType: "" };

export function TransactionsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [form, setForm] = useState<TransactionFormState>(() => emptyForm());
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const eligibleInstruments = useMemo(
    () => instruments.filter((instrument) => isCompatibleInstrument(form.transactionType, instrument)),
    [form.transactionType, instruments]
  );
  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const instrumentNames = useMemo(
    () => new Map(instruments.map((instrument) => [instrument.id, formatInstrument(instrument)])),
    [instruments]
  );
  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const selectedInstrument = instruments.find((instrument) => instrument.id === form.instrumentId);

  useEffect(() => {
    void loadPageData(0);
  }, []);

  async function loadPageData(offset = pagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const [transactionData, accountData, instrumentData] = await Promise.all([
        apiGet<TransactionsResponse>(`/transactions?${toQuery({ ...filters, limit: pageSize, offset })}`),
        apiGet<AccountsResponse>("/accounts"),
        apiGet<InstrumentsResponse>("/instruments")
      ]);

      setUser(transactionData.user);
      setTransactions(transactionData.transactions);
      setPagination(transactionData.pagination);
      setAccounts(accountData.accounts);
      setInstruments(instrumentData.instruments);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const selectedInstrument = instruments.find((instrument) => instrument.id === form.instrumentId);

      if (!selectedInstrument) {
        throw new ApiClientError("请选择投资标的。", "MISSING_INSTRUMENT");
      }

      const payload = toTransactionInput(form, selectedInstrument);
      const existingTransaction = transactions.find((transaction) => transaction.id === editingTransactionId);

      if (existingTransaction && isValuationImpactingFormChange(existingTransaction, payload)) {
        const confirmed = window.confirm("本次修改会自动更新关联现金流水，并重新计算受影响日期之后的资产快照。确定继续？");

        if (!confirmed) {
          return;
        }
      }

      const data = editingTransactionId
        ? await apiPut<TransactionResponse>(`/transactions/${editingTransactionId}`, payload)
        : await apiPost<TransactionResponse>("/transactions", payload);

      void data;
      await loadPageData(editingTransactionId ? pagination.offset : 0);
      closeDrawer();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(transaction: InvestmentTransaction) {
    const label = `${transaction.tradeDate} ${TRANSACTION_TYPE_LABELS[transaction.transactionType]} ${instrumentNames.get(transaction.instrumentId) ?? ""}`;
    if (transaction.transactionSource === "generated_cash_leg") {
      setError("自动生成的现金流水不能直接删除，请删除或修改对应的买卖交易。");
      return;
    }

    if (!window.confirm(`确定删除交易记录“${label}”？关联现金流水会同步删除，受影响日期之后的资产快照会重新计算。`)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiDelete<DeleteTransactionResponse>(`/transactions/${transaction.id}`);
      await loadPageData(pagination.offset);

      if (editingTransactionId === transaction.id) {
        closeDrawer();
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setEditingTransactionId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }

  function startEdit(transaction: InvestmentTransaction) {
    if (transaction.transactionSource === "generated_cash_leg") {
      setError("自动生成的现金流水不能直接编辑，请修改对应的买卖交易。");
      return;
    }

    setEditingTransactionId(transaction.id);
    setForm({
      accountId: transaction.accountId,
      instrumentId: transaction.instrumentId,
      transactionType: transaction.transactionType,
      tradeDate: transaction.tradeDate,
      settlementDate: transaction.settlementDate ?? "",
      quantity: toFormDecimal(transaction.quantity),
      price: toFormDecimal(transaction.price),
      grossAmount: toFormDecimal(transaction.grossAmount),
      fee: toFormDecimal(transaction.fee) === "0" ? "" : toFormDecimal(transaction.fee),
      tax: toFormDecimal(transaction.tax) === "0" ? "" : toFormDecimal(transaction.tax),
      adjustmentDirection: transaction.adjustmentDirection ?? "increase",
      notes: transaction.notes ?? ""
    });
    setDrawerOpen(true);
  }

  function changeTransactionType(transactionType: TransactionType) {
    setForm({
      ...form,
      transactionType,
      instrumentId: "",
      settlementDate: transactionType === "opening_position" || transactionType === "opening_balance" ? "" : form.settlementDate,
      quantity: "",
      price: "",
      grossAmount: "",
      fee: "",
      tax: "",
      adjustmentDirection: "increase"
    });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingTransactionId(null);
    setForm(emptyForm());
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPageData(0);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    void loadPageDataWithFilters(emptyFilters);
  }

  async function loadPageDataWithFilters(nextFilters: TransactionFilters) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<TransactionsResponse>(`/transactions?${toQuery({ ...nextFilters, limit: pageSize, offset: 0 })}`);
      setUser(data.user);
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const isTrade = form.transactionType === "buy" || form.transactionType === "sell";
  const isOpeningPosition = form.transactionType === "opening_position";
  const isOpeningTransaction = form.transactionType === "opening_position" || form.transactionType === "opening_balance";
  const hasGrossAmount = [
    "opening_position",
    "opening_balance",
    "dividend",
    "deposit",
    "withdrawal",
    "interest",
    "adjustment"
  ].includes(form.transactionType);
  const hasFee = isTrade || form.transactionType === "fee";
  const hasTax = isTrade || form.transactionType === "dividend" || form.transactionType === "tax";

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>交易记录</h1>
          <p>记录买卖、股息和现金变动。买入和卖出的成交总额由系统按数量和价格计算。</p>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving}>
              新增
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => void loadPageData(pagination.offset)} disabled={loading || saving}>
            刷新
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看交易记录。新增、编辑和删除仅限 admin。</p>
      ) : null}

      <form className="filter-bar transaction-filter-bar" onSubmit={submitFilters}>
        <label>
          开始日期
          <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
        </label>
        <label>
          结束日期
          <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
        </label>
        <label>
          账户
          <select value={filters.accountId} onChange={(event) => setFilters({ ...filters, accountId: event.target.value })}>
            <option value="">全部</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          标的
          <select value={filters.instrumentId} onChange={(event) => setFilters({ ...filters, instrumentId: event.target.value })}>
            <option value="">全部</option>
            {instruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {formatInstrument(instrument)}
              </option>
            ))}
          </select>
        </label>
        <label>
          类型
          <select
            value={filters.transactionType}
            onChange={(event) => setFilters({ ...filters, transactionType: event.target.value as "" | TransactionType })}
          >
            <option value="">全部</option>
            {TRANSACTION_TYPES.map((transactionType) => (
              <option key={transactionType} value={transactionType}>
                {TRANSACTION_TYPE_LABELS[transactionType]}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button className="secondary-button" type="submit" disabled={loading}>
            筛选
          </button>
          <button className="secondary-button" type="button" onClick={clearFilters} disabled={loading}>
            清空
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>账户</th>
              <th>标的</th>
              <th>类型</th>
              <th className="numeric-cell">数量</th>
              <th className="numeric-cell">金额/费用</th>
              <th>币种</th>
              <th>结算/来源</th>
              <th>备注</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 10 : 9}>正在加载交易记录...</td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 10 : 9}>暂无交易记录。</td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr className={editingTransactionId === transaction.id ? "editing-row" : undefined} key={transaction.id}>
                  <td>{transaction.tradeDate}</td>
                  <td>{accountNames.get(transaction.accountId) ?? "-"}</td>
                  <td>{instrumentNames.get(transaction.instrumentId) ?? "-"}</td>
                  <td>{formatTransactionType(transaction)}</td>
                  <td className="numeric-cell">{transaction.quantity ?? "-"}</td>
                  <td className="numeric-cell">{displayAmount(transaction)}</td>
                  <td>{transaction.currency}</td>
                  <td>{formatSettlement(transaction)}</td>
                  <td>{transaction.notes ?? "-"}</td>
                  {isAdmin ? (
                    <td>
                      <div className="table-actions">
                        {transaction.transactionSource === "generated_cash_leg" ? (
                          <span className="readonly-note">自动生成</span>
                        ) : (
                          <>
                            <button
                              aria-label={`编辑交易记录 ${transaction.tradeDate}`}
                              className="icon-button"
                              title="编辑"
                              type="button"
                              onClick={() => startEdit(transaction)}
                              disabled={saving}
                            >
                              <span aria-hidden="true">✎</span>
                            </button>
                            <button
                              aria-label={`删除交易记录 ${transaction.tradeDate}`}
                              className="icon-button danger-icon-button"
                              title="删除"
                              type="button"
                              onClick={() => void handleDelete(transaction)}
                              disabled={saving}
                            >
                              <span aria-hidden="true">×</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls pagination={pagination} loading={loading} onPageChange={(offset) => void loadPageData(offset)} />

      <Drawer
        open={drawerOpen}
        title={editingTransactionId ? "编辑交易记录" : "新增交易记录"}
        subtitle="现金类交易请选择对应币种的现金标的"
        onClose={closeDrawer}
        footer={
          <>
            <button
              className="primary-button"
              type="submit"
              form="transaction-drawer-form"
              disabled={saving || accounts.length === 0 || eligibleInstruments.length === 0}
            >
              {saving ? "保存中..." : editingTransactionId ? "保存修改" : "新增交易"}
            </button>
            <button className="secondary-button" type="button" onClick={closeDrawer} disabled={saving}>
              取消
            </button>
          </>
        }
      >
        <form className="transaction-form drawer-form" id="transaction-drawer-form" onSubmit={handleSubmit}>
          <label>
            交易类型
            <select value={form.transactionType} onChange={(event) => changeTransactionType(event.target.value as TransactionType)}>
              {TRANSACTION_TYPES.map((transactionType) => (
                <option key={transactionType} value={transactionType}>
                  {TRANSACTION_TYPE_LABELS[transactionType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            账户
            <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} required>
              <option value="">请选择账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            投资标的
            <select value={form.instrumentId} onChange={(event) => setForm({ ...form, instrumentId: event.target.value })} required>
              <option value="">请选择标的</option>
              {eligibleInstruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {formatInstrument(instrument)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {isOpeningTransaction ? "期初日期" : "交易日期"}
            <input type="date" value={form.tradeDate} onChange={(event) => setForm({ ...form, tradeDate: event.target.value })} required />
          </label>

          {!isOpeningTransaction ? (
            <label>
              结算日期
              <input type="date" value={form.settlementDate} onChange={(event) => setForm({ ...form, settlementDate: event.target.value })} />
            </label>
          ) : null}

          <label>
            交易币种
            <input value={selectedInstrument?.currency ?? "-"} disabled />
          </label>

          {isTrade ? (
            <label>
              结算币种
              <input value={selectedAccount?.baseCurrency ?? "-"} disabled />
            </label>
          ) : null}

          {isTrade || isOpeningPosition ? (
            <label>
              数量
              <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="0.0000000000" required />
            </label>
          ) : null}

          {isTrade ? (
            <>
              <label>
                单价
                <input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0.0000000000" required />
              </label>
              <label>
                成交总额
                <input value="由系统计算" disabled />
              </label>
            </>
          ) : null}

          {hasGrossAmount ? (
            <label>
              金额
              <input value={form.grossAmount} onChange={(event) => setForm({ ...form, grossAmount: event.target.value })} placeholder="0.000000" required />
            </label>
          ) : null}

          {hasFee ? (
            <label>
              费用
              <input value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} placeholder={form.transactionType === "fee" ? "必填" : "可选"} required={form.transactionType === "fee"} />
            </label>
          ) : null}

          {hasTax ? (
            <label>
              税务记录
              <input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} placeholder={form.transactionType === "tax" ? "必填" : "可选"} required={form.transactionType === "tax"} />
            </label>
          ) : null}

          {form.transactionType === "adjustment" ? (
            <label>
              调整方向
              <select
                value={form.adjustmentDirection}
                onChange={(event) => setForm({ ...form, adjustmentDirection: event.target.value as AdjustmentDirection })}
              >
                {ADJUSTMENT_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {ADJUSTMENT_DIRECTION_LABELS[direction]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="wide-field">
            备注
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="可选" rows={2} />
          </label>
        </form>
      </Drawer>
    </section>
  );
}

function emptyForm(): TransactionFormState {
  return {
    accountId: "",
    instrumentId: "",
    transactionType: "buy",
    tradeDate: today,
    settlementDate: "",
    quantity: "",
    price: "",
    grossAmount: "",
    fee: "",
    tax: "",
    adjustmentDirection: "increase",
    notes: ""
  };
}

function isCompatibleInstrument(transactionType: TransactionType, instrument: Instrument): boolean {
  const cashType = ["opening_balance", "fee", "tax", "deposit", "withdrawal", "interest", "adjustment"].includes(transactionType);
  if (transactionType === "opening_position") {
    return instrument.assetType !== "cash";
  }
  return cashType ? instrument.assetType === "cash" : instrument.assetType !== "cash";
}

function toTransactionInput(form: TransactionFormState, instrument: Instrument): CreateInvestmentTransactionInput {
  const isOpeningTransaction = form.transactionType === "opening_position" || form.transactionType === "opening_balance";
  const base: CreateInvestmentTransactionInput = {
    accountId: form.accountId,
    instrumentId: form.instrumentId,
    transactionType: form.transactionType,
    tradeDate: form.tradeDate,
    settlementDate: isOpeningTransaction ? null : form.settlementDate || null,
    currency: instrument.currency,
    notes: form.notes || null
  };

  switch (form.transactionType) {
    case "opening_position":
      return {
        ...base,
        quantity: decimalString(form.quantity),
        price: null,
        grossAmount: decimalString(form.grossAmount),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "opening_balance":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: decimalString(form.grossAmount),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "buy":
    case "sell":
      return {
        ...base,
        quantity: decimalString(form.quantity),
        price: decimalString(form.price),
        fee: decimalString(form.fee, "0"),
        tax: decimalString(form.tax, "0"),
        adjustmentDirection: null
      };
    case "dividend":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: decimalString(form.grossAmount),
        fee: "0",
        tax: decimalString(form.tax, "0"),
        adjustmentDirection: null
      };
    case "deposit":
    case "withdrawal":
    case "interest":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: decimalString(form.grossAmount),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "fee":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: null,
        fee: decimalString(form.fee),
        tax: "0",
        adjustmentDirection: null
      };
    case "tax":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: null,
        fee: "0",
        tax: decimalString(form.tax),
        adjustmentDirection: null
      };
    case "adjustment":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: decimalString(form.grossAmount),
        fee: "0",
        tax: "0",
        adjustmentDirection: form.adjustmentDirection
      };
  }
}

function formatInstrument(instrument: Instrument): string {
  return instrument.symbol ? `${instrument.symbol} - ${instrument.name}` : instrument.name;
}

function toFormDecimal(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function decimalString(value: string | number | null | undefined, fallback = ""): string {
  const normalized = toFormDecimal(value).trim();
  return normalized || fallback;
}

function formatTransactionType(transaction: InvestmentTransaction): string {
  const label = TRANSACTION_TYPE_LABELS[transaction.transactionType];
  const sourceSuffix = transaction.transactionSource === "generated_cash_leg" ? "（自动现金）" : "";
  const directionSuffix = transaction.adjustmentDirection
    ? `（${ADJUSTMENT_DIRECTION_LABELS[transaction.adjustmentDirection]}）`
    : "";
  return `${label}${directionSuffix}${sourceSuffix}`;
}

function displayAmount(transaction: InvestmentTransaction): string {
  if (transaction.transactionType === "fee") {
    return formatDisplayAmount(transaction.fee);
  }
  if (transaction.transactionType === "tax") {
    return formatDisplayAmount(transaction.tax);
  }
  return transaction.grossAmount === null ? "-" : formatDisplayAmount(transaction.grossAmount);
}

function formatSettlement(transaction: InvestmentTransaction): string {
  if (transaction.transactionSource === "generated_cash_leg") {
    return transaction.linkedTransactionId ? `关联交易 ${transaction.linkedTransactionId.slice(0, 8)}` : "自动现金流水";
  }

  if ((transaction.transactionType === "buy" || transaction.transactionType === "sell") && transaction.settlementAmount) {
    return `${transaction.settlementCurrency ?? transaction.currency} ${formatDisplayAmount(transaction.settlementAmount)}`;
  }

  return "-";
}

function isValuationImpactingFormChange(
  transaction: InvestmentTransaction,
  payload: CreateInvestmentTransactionInput
): boolean {
  return (
    transaction.accountId !== payload.accountId ||
    transaction.instrumentId !== payload.instrumentId ||
    transaction.transactionType !== payload.transactionType ||
    transaction.tradeDate !== payload.tradeDate ||
    (transaction.quantity ?? null) !== (payload.quantity ?? null) ||
    (transaction.price ?? null) !== (payload.price ?? null) ||
    (transaction.grossAmount ?? null) !== (payload.grossAmount ?? null) ||
    transaction.fee !== (payload.fee ?? "0") ||
    transaction.tax !== (payload.tax ?? "0") ||
    transaction.currency !== payload.currency ||
    (transaction.adjustmentDirection ?? null) !== (payload.adjustmentDirection ?? null)
  );
}

function toQuery(input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "交易记录请求失败，请稍后重试。";
}
