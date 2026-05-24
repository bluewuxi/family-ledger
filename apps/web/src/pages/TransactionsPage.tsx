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
  type TransactionType
} from "@family-ledger/shared";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";

interface TransactionsResponse {
  user: AuthenticatedUser;
  transactions: InvestmentTransaction[];
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

interface OpeningEntryFormRow {
  id: string;
  instrumentId: string;
  quantity: string;
  grossAmount: string;
  notes: string;
}

const today = new Date().toISOString().slice(0, 10);

export function TransactionsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [form, setForm] = useState<TransactionFormState>(() => emptyForm());
  const [openingAccountId, setOpeningAccountId] = useState("");
  const [openingTradeDate, setOpeningTradeDate] = useState(today);
  const [openingRows, setOpeningRows] = useState<OpeningEntryFormRow[]>(() => [emptyOpeningRow()]);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
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
  const openingAccountHasHistory = transactions.some((transaction) => transaction.accountId === openingAccountId);

  useEffect(() => {
    void loadPageData();
  }, []);

  async function loadPageData() {
    setLoading(true);
    setError(null);

    try {
      const [transactionData, accountData, instrumentData] = await Promise.all([
        apiGet<TransactionsResponse>("/transactions"),
        apiGet<AccountsResponse>("/accounts"),
        apiGet<InstrumentsResponse>("/instruments")
      ]);

      setUser(transactionData.user);
      setTransactions(transactionData.transactions);
      setAccounts(accountData.accounts);
      setInstruments(instrumentData.instruments);
      setForm((current) => withAvailableSelections(current, accountData.accounts, instrumentData.instruments));
      setOpeningAccountId((current) =>
        accountData.accounts.some((account) => account.id === current) ? current : (accountData.accounts[0]?.id ?? "")
      );
      setOpeningRows((current) => withAvailableOpeningSelections(current, instrumentData.instruments));
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpeningSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payloads = openingRows
        .filter((row) => row.instrumentId && row.grossAmount)
        .map((row) => {
          const instrument = instruments.find((item) => item.id === row.instrumentId);

          if (!instrument) {
            throw new ApiClientError("请选择投资标的。", "MISSING_INSTRUMENT");
          }

          return toOpeningTransactionInput(openingAccountId, openingTradeDate, row, instrument);
        });

      if (payloads.length === 0) {
        throw new ApiClientError("请至少填写一条期初资产。", "EMPTY_OPENING_ROWS");
      }

      const created = await Promise.all(
        payloads.map((payload) => apiPost<TransactionResponse>("/transactions", payload))
      );
      setTransactions((current) => sortTransactions([...current, ...created.map((item) => item.transaction)]));
      setOpeningRows([emptyOpeningRow()]);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function updateOpeningRow(id: string, patch: Partial<OpeningEntryFormRow>) {
    setOpeningRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addOpeningRow() {
    setOpeningRows((current) => withAvailableOpeningSelections([...current, emptyOpeningRow()], instruments));
  }

  function removeOpeningRow(id: string) {
    setOpeningRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
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
      const data = editingTransactionId
        ? await apiPut<TransactionResponse>(`/transactions/${editingTransactionId}`, payload)
        : await apiPost<TransactionResponse>("/transactions", payload);

      setTransactions((current) =>
        sortTransactions(
          editingTransactionId
            ? current.map((transaction) =>
                transaction.id === data.transaction.id ? data.transaction : transaction
              )
            : [...current, data.transaction]
        )
      );
      clearForm();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(transaction: InvestmentTransaction) {
    const label = `${transaction.tradeDate} ${TRANSACTION_TYPE_LABELS[transaction.transactionType]} ${instrumentNames.get(transaction.instrumentId) ?? ""}`;

    if (!window.confirm(`确定删除交易记录“${label}”？`)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiDelete<DeleteTransactionResponse>(`/transactions/${transaction.id}`);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));

      if (editingTransactionId === transaction.id) {
        clearForm();
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(transaction: InvestmentTransaction) {
    setEditingTransactionId(transaction.id);
    setForm({
      accountId: transaction.accountId,
      instrumentId: transaction.instrumentId,
      transactionType: transaction.transactionType,
      tradeDate: transaction.tradeDate,
      settlementDate: transaction.settlementDate ?? "",
      quantity: transaction.quantity ?? "",
      price: transaction.price ?? "",
      grossAmount: transaction.grossAmount ?? "",
      fee: transaction.fee === "0" ? "" : transaction.fee,
      tax: transaction.tax === "0" ? "" : transaction.tax,
      adjustmentDirection: transaction.adjustmentDirection ?? "increase",
      notes: transaction.notes ?? ""
    });
  }

  function changeTransactionType(transactionType: TransactionType) {
    const reset = {
      ...form,
      transactionType,
      instrumentId: "",
      quantity: "",
      price: "",
      grossAmount: "",
      fee: "",
      tax: "",
      adjustmentDirection: "increase" as AdjustmentDirection
    };
    setForm(withAvailableSelections(reset, accounts, instruments));
  }

  function changeInstrument(instrumentId: string) {
    setForm({ ...form, instrumentId });
  }

  function clearForm() {
    setEditingTransactionId(null);
    setForm(withAvailableSelections(emptyForm(), accounts, instruments));
  }

  const isTrade = form.transactionType === "buy" || form.transactionType === "sell";
  const isOpeningPosition = form.transactionType === "opening_position";
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
        <button className="secondary-button" type="button" onClick={loadPageData} disabled={loading || saving}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {isAdmin ? (
        <>
        <form className="opening-form" onSubmit={handleOpeningSubmit}>
          <div className="form-heading">
            <h2>期初资产初始化</h2>
            <span>为一个账户批量录入期初现金和持仓，系统会创建期初交易记录。</span>
          </div>

          <label>
            账户
            <select value={openingAccountId} onChange={(event) => setOpeningAccountId(event.target.value)} required>
              <option value="">请选择账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            期初日期
            <input
              type="date"
              value={openingTradeDate}
              onChange={(event) => setOpeningTradeDate(event.target.value)}
              required
            />
          </label>

          {openingAccountHasHistory ? (
            <p className="form-warning wide-field">该账户已有交易记录。仍可录入期初资产，但请确认日期和备注，避免重复计算。</p>
          ) : null}

          <div className="opening-entry-table wide-field">
            <div className="opening-entry-row opening-entry-head">
              <span>标的</span>
              <span>数量</span>
              <span>总成本/余额</span>
              <span>备注</span>
              <span>操作</span>
            </div>
            {openingRows.map((row) => {
              const instrument = instruments.find((item) => item.id === row.instrumentId);
              const isCash = instrument?.assetType === "cash";

              return (
                <div className="opening-entry-row" key={row.id}>
                  <select
                    value={row.instrumentId}
                    onChange={(event) => updateOpeningRow(row.id, { instrumentId: event.target.value, quantity: "" })}
                    required
                  >
                    <option value="">请选择标的</option>
                    {instruments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatInstrument(item)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={isCash ? "现金余额" : row.quantity}
                    onChange={(event) => updateOpeningRow(row.id, { quantity: event.target.value })}
                    disabled={isCash}
                    placeholder="0.0000000000"
                    required={!isCash}
                  />
                  <input
                    value={row.grossAmount}
                    onChange={(event) => updateOpeningRow(row.id, { grossAmount: event.target.value })}
                    placeholder={isCash ? "期初余额" : "总成本"}
                    required
                  />
                  <input
                    value={row.notes}
                    onChange={(event) => updateOpeningRow(row.id, { notes: event.target.value })}
                    placeholder="可选"
                  />
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => removeOpeningRow(row.id)}
                    disabled={saving || openingRows.length === 1}
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={addOpeningRow} disabled={saving}>
              添加一行
            </button>
            <button className="primary-button" type="submit" disabled={saving || !openingAccountId}>
              {saving ? "保存中..." : "保存期初资产"}
            </button>
          </div>
        </form>

        <form className="transaction-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h2>{editingTransactionId ? "编辑交易记录" : "新增交易记录"}</h2>
            <span>现金类交易请选择相应币种的现金标的</span>
          </div>

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
            <select value={form.instrumentId} onChange={(event) => changeInstrument(event.target.value)} required>
              <option value="">请选择标的</option>
              {eligibleInstruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {formatInstrument(instrument)}
                </option>
              ))}
            </select>
          </label>

          <label>
            交易日期
            <input type="date" value={form.tradeDate} onChange={(event) => setForm({ ...form, tradeDate: event.target.value })} required />
          </label>

          <label>
            结算日期
            <input type="date" value={form.settlementDate} onChange={(event) => setForm({ ...form, settlementDate: event.target.value })} />
          </label>

          <label>
            币种
            <input value={instruments.find((instrument) => instrument.id === form.instrumentId)?.currency ?? "-"} disabled />
          </label>

          {isTrade || isOpeningPosition ? (
            <>
              <label>
                数量
                <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="0.0000000000" required />
              </label>
            </>
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

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving || accounts.length === 0 || eligibleInstruments.length === 0}>
              {saving ? "保存中..." : editingTransactionId ? "保存修改" : "新增交易"}
            </button>
            {editingTransactionId ? (
              <button className="secondary-button" type="button" onClick={clearForm} disabled={saving}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
        </>
      ) : !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看交易记录。新增、编辑和删除仅限 admin。</p>
      ) : null}

      <div className="table-wrap">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>账户</th>
              <th>标的</th>
              <th>类型</th>
              <th>数量</th>
              <th>金额/费用</th>
              <th>币种</th>
              <th>备注</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8}>正在加载交易记录...</td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8}>暂无交易记录。</td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.tradeDate}</td>
                  <td>{accountNames.get(transaction.accountId) ?? "-"}</td>
                  <td>{instrumentNames.get(transaction.instrumentId) ?? "-"}</td>
                  <td>{formatTransactionType(transaction)}</td>
                  <td>{transaction.quantity ?? "-"}</td>
                  <td>{displayAmount(transaction)}</td>
                  <td>{transaction.currency}</td>
                  <td>{transaction.notes ?? "-"}</td>
                  {isAdmin ? (
                    <td>
                      <div className="table-actions">
                        <button className="text-button" type="button" onClick={() => startEdit(transaction)} disabled={saving}>
                          编辑
                        </button>
                        <button className="danger-button" type="button" onClick={() => void handleDelete(transaction)} disabled={saving}>
                          删除
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

function emptyOpeningRow(): OpeningEntryFormRow {
  return {
    id: crypto.randomUUID(),
    instrumentId: "",
    quantity: "",
    grossAmount: "",
    notes: ""
  };
}

function withAvailableSelections(
  form: TransactionFormState,
  accounts: InvestmentAccount[],
  instruments: Instrument[]
): TransactionFormState {
  const eligible = instruments.filter((instrument) => isCompatibleInstrument(form.transactionType, instrument));
  const accountId = accounts.some((account) => account.id === form.accountId) ? form.accountId : (accounts[0]?.id ?? "");
  const instrumentId = eligible.some((instrument) => instrument.id === form.instrumentId)
    ? form.instrumentId
    : (eligible[0]?.id ?? "");
  return { ...form, accountId, instrumentId };
}

function withAvailableOpeningSelections(
  rows: OpeningEntryFormRow[],
  instruments: Instrument[]
): OpeningEntryFormRow[] {
  return rows.map((row) => ({
    ...row,
    instrumentId: instruments.some((instrument) => instrument.id === row.instrumentId)
      ? row.instrumentId
      : (instruments[0]?.id ?? "")
  }));
}

function isCompatibleInstrument(transactionType: TransactionType, instrument: Instrument): boolean {
  const cashType = ["opening_balance", "fee", "tax", "deposit", "withdrawal", "interest", "adjustment"].includes(transactionType);
  if (transactionType === "opening_position") {
    return instrument.assetType !== "cash";
  }
  return cashType ? instrument.assetType === "cash" : instrument.assetType !== "cash";
}

function toTransactionInput(form: TransactionFormState, instrument: Instrument): CreateInvestmentTransactionInput {
  const base: CreateInvestmentTransactionInput = {
    accountId: form.accountId,
    instrumentId: form.instrumentId,
    transactionType: form.transactionType,
    tradeDate: form.tradeDate,
    settlementDate: form.settlementDate || null,
    currency: instrument.currency,
    notes: form.notes || null
  };

  switch (form.transactionType) {
    case "opening_position":
      return {
        ...base,
        quantity: form.quantity,
        price: null,
        grossAmount: form.grossAmount,
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "opening_balance":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: form.grossAmount,
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "buy":
    case "sell":
      return {
        ...base,
        quantity: form.quantity,
        price: form.price,
        fee: form.fee || "0",
        tax: form.tax || "0",
        adjustmentDirection: null
      };
    case "dividend":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: form.grossAmount,
        fee: "0",
        tax: form.tax || "0",
        adjustmentDirection: null
      };
    case "deposit":
    case "withdrawal":
    case "interest":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: form.grossAmount,
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
        fee: form.fee,
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
        tax: form.tax,
        adjustmentDirection: null
      };
    case "adjustment":
      return {
        ...base,
        quantity: null,
        price: null,
        grossAmount: form.grossAmount,
        fee: "0",
        tax: "0",
        adjustmentDirection: form.adjustmentDirection
      };
  }
}

function toOpeningTransactionInput(
  accountId: string,
  tradeDate: string,
  row: OpeningEntryFormRow,
  instrument: Instrument
): CreateInvestmentTransactionInput {
  const isCash = instrument.assetType === "cash";

  return {
    accountId,
    instrumentId: instrument.id,
    transactionType: isCash ? "opening_balance" : "opening_position",
    tradeDate,
    settlementDate: null,
    quantity: isCash ? null : row.quantity,
    price: null,
    grossAmount: row.grossAmount,
    fee: "0",
    tax: "0",
    currency: instrument.currency,
    adjustmentDirection: null,
    notes: row.notes || (isCash ? "期初余额" : "期初持仓")
  };
}

function formatInstrument(instrument: Instrument): string {
  return instrument.symbol ? `${instrument.symbol} - ${instrument.name}` : instrument.name;
}

function formatTransactionType(transaction: InvestmentTransaction): string {
  const label = TRANSACTION_TYPE_LABELS[transaction.transactionType];
  return transaction.adjustmentDirection ? `${label}（${ADJUSTMENT_DIRECTION_LABELS[transaction.adjustmentDirection]}）` : label;
}

function displayAmount(transaction: InvestmentTransaction): string {
  if (transaction.transactionType === "fee") {
    return transaction.fee;
  }
  if (transaction.transactionType === "tax") {
    return transaction.tax;
  }
  return transaction.grossAmount ?? "-";
}

function sortTransactions(transactions: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort((left, right) => {
    const dateComparison = right.tradeDate.localeCompare(left.tradeDate);
    return dateComparison || right.createdAt.localeCompare(left.createdAt);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "交易记录请求失败，请稍后重试。";
}
