import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eraser, Filter, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
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
import { Drawer } from "../components/Drawer";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";
import { formatDisplayAmount } from "../lib/numberFormat";

interface TransactionsResponse {
  user: AuthenticatedUser;
  transactions: InvestmentTransaction[];
}

interface AccountsResponse {
  user: AuthenticatedUser;
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
const transactionFetchLimit = 200;
const emptyFilters: TransactionFilters = { from: "", to: "", accountId: "", instrumentId: "", transactionType: "" };
const editableTransactionTypes = TRANSACTION_TYPES.filter((transactionType) => transactionType !== "tax");

export function TransactionsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [form, setForm] = useState<TransactionFormState>(() => emptyForm());
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(() => new Set());
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
  const hasSelectedAccount = Boolean(filters.accountId);
  const drawerTitle = `${editingTransactionId ? "编辑交易记录" : "新增交易记录"}${
    selectedAccount ? ` - ${selectedAccount.name}` : ""
  }`;
  const linkedCashLegs = useMemo(
    () =>
      new Map(
        transactions
          .filter((transaction) => transaction.transactionSource === "generated_cash_leg" && transaction.linkedTransactionId)
          .map((transaction) => [transaction.linkedTransactionId as string, transaction])
      ),
    [transactions]
  );
  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.transactionSource !== "generated_cash_leg")
        .filter((transaction) => transactionMatchesFilters(transaction, filters)),
    [filters, transactions]
  );

  useEffect(() => {
    void loadPageData();
  }, []);

  async function loadPageData(nextFilters = filters) {
    setLoading(true);
    setError(null);

    try {
      const transactionRequest = nextFilters.accountId
        ? apiGet<TransactionsResponse>(
            `/transactions?${toQuery({ accountId: nextFilters.accountId, limit: transactionFetchLimit, offset: 0 })}`
          )
        : null;
      const [transactionData, accountData, instrumentData] = await Promise.all([
        transactionRequest,
        apiGet<AccountsResponse>("/accounts"),
        apiGet<InstrumentsResponse>("/instruments")
      ]);

      if (transactionData) {
        setUser(transactionData.user);
        setTransactions(transactionData.transactions);
      } else {
        setUser(accountData.user);
        setTransactions([]);
      }

      setAccounts(accountData.accounts);
      setInstruments(instrumentData.instruments);
      setExpandedTransactionIds(new Set());
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
      await loadPageData();
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
      await loadPageData();

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
    setForm(emptyForm(filters.accountId));
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
    const isOpeningType = transactionType === "opening_position" || transactionType === "opening_balance";

    setForm({
      ...form,
      transactionType,
      instrumentId: "",
      settlementDate: isOpeningType ? "" : form.settlementDate || today,
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
    setForm(emptyForm(filters.accountId));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPageData();
  }

  function clearFilters() {
    setFilters(emptyFilters);
    void loadPageData(emptyFilters);
  }

  function changeAccountFilter(accountId: string) {
    const nextFilters = { ...filters, accountId };
    setFilters(nextFilters);
    void loadPageData(nextFilters);
  }

  function toggleLinkedCashLeg(transactionId: string) {
    setExpandedTransactionIds((current) => {
      const next = new Set(current);

      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }

      return next;
    });
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
          <label className="header-account-select">
            <span>账户</span>
            <select value={filters.accountId} onChange={(event) => changeAccountFilter(event.target.value)} required>
              <option value="">请选择账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving || !hasSelectedAccount}>
              <Plus size={17} aria-hidden="true" />
              <span>新增</span>
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => void loadPageData()} disabled={loading || saving || !hasSelectedAccount}>
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看交易记录。新增、编辑和删除仅限 admin。</p>
      ) : null}

      {!loading && !hasSelectedAccount ? (
        <p className="selection-hint">请先选择账户，再查看或新增交易记录。</p>
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
        <label className="transaction-instrument-filter">
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
          <button className="secondary-button" type="submit" disabled={loading || !hasSelectedAccount}>
            <Filter size={17} aria-hidden="true" />
            <span>筛选</span>
          </button>
          <button className="secondary-button" type="button" onClick={clearFilters} disabled={loading || !hasSelectedAccount}>
            <Eraser size={17} aria-hidden="true" />
            <span>清空</span>
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table className="transaction-table">
          <thead>
            <tr>
              <th className="transaction-expand-column"></th>
              <th>日期</th>
              <th>账户</th>
              <th>标的</th>
              <th>类型</th>
              <th className="numeric-cell">数量</th>
              <th className="numeric-cell">金额/费用</th>
              <th>币种</th>
              <th>结算</th>
              <th>备注</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 11 : 10}>正在加载交易记录...</td>
              </tr>
            ) : !filters.accountId ? (
              <tr>
                <td colSpan={isAdmin ? 11 : 10}>请先选择账户查看交易记录。</td>
              </tr>
            ) : visibleTransactions.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 11 : 10}>暂无符合筛选条件的交易记录。</td>
              </tr>
            ) : (
              visibleTransactions.map((transaction) => {
                const linkedCashLeg = linkedCashLegs.get(transaction.id);
                const isExpanded = expandedTransactionIds.has(transaction.id);

                return (
                  <Fragment key={transaction.id}>
                    {renderTransactionRow({
                      transaction,
                      accountNames,
                      instrumentNames,
                      isAdmin,
                      saving,
                      editingTransactionId,
                      linkedCashLeg,
                      isExpanded,
                      onToggleLinkedCashLeg: toggleLinkedCashLeg,
                      onEdit: startEdit,
                      onDelete: handleDelete
                    })}
                    {linkedCashLeg && isExpanded
                      ? renderTransactionRow({
                          transaction: linkedCashLeg,
                          accountNames,
                          instrumentNames,
                          isAdmin,
                          saving,
                          editingTransactionId,
                          linkedCashLeg: undefined,
                          isExpanded: false,
                          onToggleLinkedCashLeg: toggleLinkedCashLeg,
                          onEdit: startEdit,
                          onDelete: handleDelete,
                          isChildRow: true
                        })
                      : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        subtitle="现金类交易请选择对应币种的现金标的"
        onClose={closeDrawer}
        footer={
          <>
            <button
              className="primary-button"
              type="submit"
              form="transaction-drawer-form"
              disabled={saving || !form.accountId || accounts.length === 0 || eligibleInstruments.length === 0}
            >
              <Save size={17} aria-hidden="true" />
              <span>{saving ? "保存中..." : editingTransactionId ? "保存修改" : "新增交易"}</span>
            </button>
            <button className="secondary-button" type="button" onClick={closeDrawer} disabled={saving}>
              <X size={17} aria-hidden="true" />
              <span>取消</span>
            </button>
          </>
        }
      >
        <form className="transaction-form drawer-form" id="transaction-drawer-form" onSubmit={handleSubmit}>
          {editingTransactionId ? (
            <p className="form-warning transaction-edit-warning">
              修改交易记录可能会自动更新关联现金流水，并重新计算受影响日期之后的资产快照。交易类型不可在编辑时修改，如需更换类型请删除后重新新增。
            </p>
          ) : null}

          <label>
            交易类型
            <select
              value={form.transactionType}
              onChange={(event) => changeTransactionType(event.target.value as TransactionType)}
              disabled={Boolean(editingTransactionId)}
            >
              {form.transactionType === "tax" ? (
                <option value="tax" disabled>
                  {TRANSACTION_TYPE_LABELS.tax}
                </option>
              ) : null}
              {editableTransactionTypes.map((transactionType) => (
                <option key={transactionType} value={transactionType}>
                  {TRANSACTION_TYPE_LABELS[transactionType]}
                </option>
              ))}
            </select>
          </label>

          <label className="transaction-instrument-field">
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
            <input className="readonly-display-input" value={selectedInstrument?.currency ?? "-"} disabled />
          </label>

          {isTrade ? (
            <label>
              结算币种
              <input className="readonly-display-input" value={selectedAccount?.baseCurrency ?? "-"} disabled />
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
                <input className="readonly-display-input" value="由系统计算" disabled />
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

function emptyForm(accountId = ""): TransactionFormState {
  return {
    accountId,
    instrumentId: "",
    transactionType: "buy",
    tradeDate: today,
    settlementDate: today,
    quantity: "",
    price: "",
    grossAmount: "",
    fee: "",
    tax: "",
    adjustmentDirection: "increase",
    notes: ""
  };
}

interface RenderTransactionRowInput {
  transaction: InvestmentTransaction;
  accountNames: Map<string, string>;
  instrumentNames: Map<string, string>;
  isAdmin: boolean;
  saving: boolean;
  editingTransactionId: string | null;
  linkedCashLeg: InvestmentTransaction | undefined;
  isExpanded: boolean;
  onToggleLinkedCashLeg: (transactionId: string) => void;
  onEdit: (transaction: InvestmentTransaction) => void;
  onDelete: (transaction: InvestmentTransaction) => void | Promise<void>;
  isChildRow?: boolean;
}

function renderTransactionRow(input: RenderTransactionRowInput) {
  const {
    transaction,
    accountNames,
    instrumentNames,
    isAdmin,
    saving,
    editingTransactionId,
    linkedCashLeg,
    isExpanded,
    onToggleLinkedCashLeg,
    onEdit,
    onDelete,
    isChildRow = false
  } = input;
  const canExpand = Boolean(linkedCashLeg);

  return (
    <tr
      className={[
        editingTransactionId === transaction.id ? "editing-row" : "",
        isChildRow ? "transaction-child-row" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      key={isChildRow ? `cash-${transaction.id}` : transaction.id}
    >
      <td className="transaction-expand-column">
        {canExpand ? (
          <button
            aria-label={isExpanded ? "收起关联现金流水" : "展开关联现金流水"}
            className="transaction-expand-button"
            title={isExpanded ? "收起关联现金流水" : "展开关联现金流水"}
            type="button"
            onClick={() => onToggleLinkedCashLeg(transaction.id)}
          >
            {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          </button>
        ) : null}
      </td>
      <td>{transaction.tradeDate}</td>
      <td>{accountNames.get(transaction.accountId) ?? "-"}</td>
      <td>
        <span className={isChildRow ? "transaction-child-indent" : undefined}>
          {instrumentNames.get(transaction.instrumentId) ?? "-"}
        </span>
      </td>
      <td>
        <span className="transaction-type-cell">
          <span className={transactionTypeClassName(transaction)}>{formatTransactionType(transaction)}</span>
        </span>
      </td>
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
                  onClick={() => onEdit(transaction)}
                  disabled={saving}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  aria-label={`删除交易记录 ${transaction.tradeDate}`}
                  className="icon-button danger-icon-button"
                  title="删除"
                  type="button"
                  onClick={() => void onDelete(transaction)}
                  disabled={saving}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function transactionMatchesFilters(transaction: InvestmentTransaction, filters: TransactionFilters): boolean {
  return (
    (!filters.from || transaction.tradeDate >= filters.from) &&
    (!filters.to || transaction.tradeDate <= filters.to) &&
    (!filters.instrumentId || transaction.instrumentId === filters.instrumentId) &&
    (!filters.transactionType || transaction.transactionType === filters.transactionType)
  );
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
  if (transaction.transactionSource === "generated_cash_leg") {
    return "现金结算";
  }

  const label = TRANSACTION_TYPE_LABELS[transaction.transactionType];
  const directionSuffix = transaction.adjustmentDirection
    ? `（${ADJUSTMENT_DIRECTION_LABELS[transaction.adjustmentDirection]}）`
    : "";
  return `${label}${directionSuffix}`;
}

function transactionTypeClassName(transaction: InvestmentTransaction): string {
  if (transaction.transactionSource === "generated_cash_leg") {
    return "transaction-type transaction-type-generated";
  }

  if (transaction.transactionType === "buy" || transaction.transactionType === "deposit") {
    return "transaction-type transaction-type-red";
  }

  if (transaction.transactionType === "sell" || transaction.transactionType === "withdrawal") {
    return "transaction-type transaction-type-green";
  }

  return "transaction-type";
}

function displayAmount(transaction: InvestmentTransaction): string {
  if (transaction.transactionSource === "generated_cash_leg") {
    return formatSignedCashSettlement(transaction);
  }

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
    return formatSignedCashSettlement(transaction);
  }

  if ((transaction.transactionType === "buy" || transaction.transactionType === "sell") && transaction.settlementAmount) {
    return `${transaction.settlementCurrency ?? transaction.currency} ${formatDisplayAmount(transaction.settlementAmount)}`;
  }

  return "-";
}

function formatSignedCashSettlement(transaction: InvestmentTransaction): string {
  if (!transaction.grossAmount) {
    return "-";
  }

  const prefix = transaction.transactionType === "deposit" ? "+" : transaction.transactionType === "withdrawal" ? "-" : "";
  return `${prefix}${formatDisplayAmount(transaction.grossAmount)}`;
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
