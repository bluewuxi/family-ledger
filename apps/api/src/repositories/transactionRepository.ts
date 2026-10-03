import type {
  AccountPurpose,
  TransactionSortBy,
  TransactionSortDirection,
  CreateInvestmentTransactionInput,
  InvestmentTransaction,
  TransactionSource,
  TransactionType,
  UpdateInvestmentTransactionInput
} from "@family-ledger/shared";
import type { CreateInstrumentPriceInput, PortfolioSnapshotValuation } from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { readAllRows } from "./readAllRows";

export interface TransactionListFilters {
  excludeEducation?: boolean;
  sortBy?: TransactionSortBy;
  sortDirection?: TransactionSortDirection;
  purpose?: AccountPurpose;
  from?: string;
  to?: string;
  accountId?: string;
  instrumentId?: string;
  transactionType?: TransactionType;
  transactionTypes?: TransactionType[];
  excludeGeneratedCashLegs?: boolean;
  excludeCashInstruments?: boolean;
  limit?: number;
  offset?: number;
}

interface InvestmentTransactionRow {
  id: string;
  account_id: string;
  instrument_id: string;
  instruments?: {
    symbol: string | null;
    name: string;
    short_name: string;
    asset_type: InvestmentTransaction["instrumentAssetType"];
  } | null;
  transaction_type: InvestmentTransaction["transactionType"];
  trade_date: string;
  settlement_date: string | null;
  quantity: string | number | null;
  price: string | number | null;
  gross_amount: string | number | null;
  fee: string | number;
  tax: string | number;
  currency: InvestmentTransaction["currency"];
  adjustment_direction: InvestmentTransaction["adjustmentDirection"];
  transaction_source: TransactionSource;
  linked_transaction_id: string | null;
  settlement_currency: InvestmentTransaction["settlementCurrency"];
  settlement_amount: string | number | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export class TransactionNotFoundError extends Error {
  constructor() {
    super("Transaction was not found.");
  }
}

export class TransactionReferenceError extends Error {
  constructor() {
    super("Transaction references an account or instrument that does not exist.");
  }
}

export class TransactionConstraintError extends Error {
  constructor(public readonly constraint: string | null) {
    super("Transaction violates a database constraint.");
  }
}

async function transactionQuery(input: TransactionListFilters, exactCount = false) {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("transactions")
    .select((input.excludeCashInstruments ? transactionSelectWithInnerInstrument : transactionSelect)
      + (input.purpose || input.excludeEducation ? ", investment_accounts!inner(purpose)" : ""), exactCount ? { count: "exact" } : {});
  const sortColumn = { tradeDate: "trade_date", settlementDate: "settlement_date", instrument: "instruments(short_name)", transactionType: "transaction_type" }[input.sortBy ?? "tradeDate"];
  query = query.order(sortColumn, { ascending: input.sortDirection === "asc", nullsFirst: false });
  if (input.sortBy && input.sortBy !== "tradeDate") query = query.order("trade_date", { ascending: false });
  query = query.order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (input.purpose) query = query.eq("investment_accounts.purpose", input.purpose);
  if (input.excludeEducation) query = query.neq("investment_accounts.purpose", "education");

  if (input.from) {
    query = query.gte("trade_date", input.from);
  }
  if (input.to) {
    query = query.lte("trade_date", input.to);
  }
  if (input.accountId) {
    query = query.eq("account_id", input.accountId);
  }
  if (input.instrumentId) {
    query = query.eq("instrument_id", input.instrumentId);
  }
  if (input.transactionType) {
    query = query.eq("transaction_type", input.transactionType);
  }
  if (input.transactionTypes && input.transactionTypes.length > 0) {
    query = query.in("transaction_type", input.transactionTypes);
  }
  if (input.excludeGeneratedCashLegs) {
    query = query.neq("transaction_source", "generated_cash_leg");
  }
  if (input.excludeCashInstruments) {
    query = query.neq("instruments.asset_type", "cash");
  }
  return { query };
}

export async function listTransactionPage(input: TransactionListFilters & { limit: number; offset: number }) {
  const { query } = await transactionQuery(input, true);
  const { data, error, count } = await query.range(input.offset, input.offset + input.limit - 1);
  if (error) throw new Error("Failed to list transactions.");
  return { items: (data as unknown as InvestmentTransactionRow[]).map(mapTransactionRow), total: count ?? 0 };
}

export async function listTransactions(input: TransactionListFilters = {}): Promise<InvestmentTransaction[]> {
  let { query } = await transactionQuery(input);
  if (input.limit !== undefined && input.offset !== undefined) {
    query = query.range(input.offset, input.offset + input.limit);
  }

  const { data, error } = input.limit !== undefined
    ? await query.returns<InvestmentTransactionRow[]>()
    : await readAllRows(query.returns<InvestmentTransactionRow[]>());

  if (error) {
    throw new Error("Failed to list transactions.");
  }

  return (data as unknown as InvestmentTransactionRow[]).map(mapTransactionRow);
}

export async function listTransactionsUntil(tradeDate: string): Promise<InvestmentTransaction[]> {
  return (await listTransactions({ to: tradeDate })).reverse();
}

export async function listManualPrincipalTransactionsUntil(tradeDate: string, purpose?: AccountPurpose): Promise<InvestmentTransaction[]> {
  const rows = await listTransactions({
    to: tradeDate, purpose,
    transactionTypes: ["opening_position", "opening_balance", "deposit", "withdrawal"]
  });
  return rows.filter((row) => row.transactionSource === "manual").reverse();
}

export async function findTransactionById(id: string): Promise<InvestmentTransaction | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionSelect)
    .eq("id", id)
    .maybeSingle<InvestmentTransactionRow>();

  if (error) {
    throw new Error("Failed to find transaction.");
  }

  return data ? mapTransactionRow(data) : null;
}

export async function findGeneratedCashLegByParentId(parentId: string): Promise<InvestmentTransaction | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionSelect)
    .eq("linked_transaction_id", parentId)
    .eq("transaction_source", "generated_cash_leg")
    .maybeSingle<InvestmentTransactionRow>();

  if (error) {
    throw new Error("Failed to find linked cash transaction.");
  }

  return data ? mapTransactionRow(data) : null;
}

export async function createTransaction(
  input: CreateInvestmentTransactionInput,
  userId: string
): Promise<InvestmentTransaction> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...toTransactionRow(input),
      created_by_user_id: userId,
      updated_by_user_id: userId
    })
    .select(transactionSelect)
    .single<InvestmentTransactionRow>();

  if (error) {
    if (error.code === "23503") {
      throw new TransactionReferenceError();
    }

    if (error.code === "23514" || error.code === "22P02") {
      throw new TransactionConstraintError(error.code === "23514" ? error.message : null);
    }

    throw new Error("Failed to create transaction.");
  }

  return mapTransactionRow(data);
}

export async function updateTransaction(
  id: string,
  input: UpdateInvestmentTransactionInput,
  userId: string
): Promise<InvestmentTransaction> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      ...toTransactionUpdateRow(input),
      updated_by_user_id: userId
    })
    .eq("id", id)
    .select(transactionSelect)
    .maybeSingle<InvestmentTransactionRow>();

  if (error) {
    if (error.code === "23503") {
      throw new TransactionReferenceError();
    }

    if (error.code === "23514" || error.code === "22P02") {
      throw new TransactionConstraintError(error.code === "23514" ? error.message : null);
    }

    throw new Error("Failed to update transaction.");
  }

  if (!data) {
    throw new TransactionNotFoundError();
  }

  return mapTransactionRow(data);
}

export async function deleteTransaction(id: string): Promise<void> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("Failed to delete transaction.");
  }

  if (!data) {
    throw new TransactionNotFoundError();
  }
}

export async function deleteGeneratedCashLegByParentId(parentId: string): Promise<void> {
  const supabase = await getSupabaseAdmin();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("linked_transaction_id", parentId)
    .eq("transaction_source", "generated_cash_leg");

  if (error) {
    throw new Error("Failed to delete linked cash transaction.");
  }
}

const transactionSelect = [
  "id",
  "account_id",
  "instrument_id",
  "instruments(symbol, name, short_name, asset_type)",
  "transaction_type",
  "trade_date",
  "settlement_date",
  "quantity",
  "price",
  "gross_amount",
  "fee",
  "tax",
  "currency",
  "adjustment_direction",
  "transaction_source",
  "linked_transaction_id",
  "settlement_currency",
  "settlement_amount",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

const transactionSelectWithInnerInstrument = transactionSelect.replace(
  "instruments(symbol, name, short_name, asset_type)",
  "instruments!inner(symbol, name, short_name, asset_type)"
);

function mapTransactionRow(row: InvestmentTransactionRow): InvestmentTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    instrumentId: row.instrument_id,
    instrumentSymbol: row.instruments?.symbol ?? null,
    instrumentName: row.instruments?.name ?? null,
    instrumentShortName: row.instruments?.short_name ?? null,
    instrumentAssetType: row.instruments?.asset_type ?? null,
    transactionType: row.transaction_type,
    tradeDate: row.trade_date,
    settlementDate: row.settlement_date,
    quantity: row.quantity == null ? null : String(row.quantity),
    price: row.price == null ? null : String(row.price),
    grossAmount: row.gross_amount == null ? null : String(row.gross_amount),
    fee: String(row.fee),
    tax: String(row.tax),
    currency: row.currency,
    adjustmentDirection: row.adjustment_direction,
    transactionSource: row.transaction_source,
    linkedTransactionId: row.linked_transaction_id,
    settlementCurrency: row.settlement_currency,
    settlementAmount: row.settlement_amount == null ? null : String(row.settlement_amount),
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toTransactionRow(input: CreateInvestmentTransactionInput) {
  return {
    account_id: input.accountId,
    instrument_id: input.instrumentId,
    transaction_type: input.transactionType,
    trade_date: input.tradeDate,
    settlement_date: input.settlementDate ?? null,
    quantity: input.quantity ?? null,
    price: input.price ?? null,
    gross_amount: input.grossAmount ?? null,
    fee: input.fee ?? "0",
    tax: input.tax ?? "0",
    currency: input.currency,
    adjustment_direction: input.adjustmentDirection ?? null,
    transaction_source: input.transactionSource ?? "manual",
    linked_transaction_id: input.linkedTransactionId ?? null,
    settlement_currency: input.settlementCurrency ?? null,
    settlement_amount: input.settlementAmount ?? null,
    notes: input.notes ?? null
  };
}

export async function getTransactionWriteRevision(): Promise<string> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_ledger_write_revision");
  if (error || typeof data !== "string") {
    throw new ApiRequestError("INTERNAL_ERROR", "无法读取交易校验数据，本次操作未保存，请稍后重试。", 500);
  }
  return data;
}

export async function commitTransactionWrite(input: {
  operation: "create" | "update" | "delete";
  id: string;
  revision: string;
  userId: string;
  transaction: CreateInvestmentTransactionInput | null;
  cashLeg: CreateInvestmentTransactionInput | null;
  price: CreateInstrumentPriceInput | null;
  snapshots: PortfolioSnapshotValuation[];
  updateDerivedData: boolean;
}): Promise<InvestmentTransaction | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("commit_transaction_write", {
    operation: input.operation,
    transaction_id: input.id,
    expected_revision: input.revision,
    actor_id: input.userId,
    parent_row: input.transaction ? toTransactionRow(input.transaction) : null,
    cash_row: input.cashLeg ? toTransactionRow(input.cashLeg) : null,
    price_row: input.price,
    snapshot_values: input.snapshots,
    update_derived_data: input.updateDerivedData
  });
  if (error) {
    const stage = ["transaction", "cash", "price", "snapshot"].includes(error.details) ? error.details : null;
    console.error("Atomic transaction write failed", { operation: input.operation, code: error.code, stage });
    if (!/^[0-9A-Z]{5}$/.test(error.code) || error.code.startsWith("08")) {
      throw new ApiRequestError("INTERNAL_ERROR", "未能确认交易保存结果，请先刷新交易记录，确认是否已保存后再操作，避免重复提交。", 500);
    }
    if (["40001", "40P01"].includes(error.code)) {
      throw new ApiRequestError("CONFLICT", "账户或行情数据已发生变化，本次操作未保存，请刷新后重试。", 409);
    }
    if (error.code === "P0002") throw new TransactionNotFoundError();
    if (error.code === "42501") {
      throw new ApiRequestError("FORBIDDEN", "需要有效的管理员权限，本次操作未保存。", 403);
    }
    if (error.details === "snapshot") {
      throw new ApiRequestError("INTERNAL_ERROR", "历史资产快照保存失败，本次操作已全部回滚，交易和现金余额未改变。请稍后重试或联系管理员。", 500);
    }
    if (error.details === "price") {
      throw new ApiRequestError("INTERNAL_ERROR", "历史价格保存失败，本次操作已全部回滚，交易和现金余额未改变。请稍后重试。", 500);
    }
    if (error.code === "23503") throw new TransactionReferenceError();
    if (["23514", "22P02"].includes(error.code)) {
      throw new ApiRequestError("VALIDATION_ERROR", "交易或关联现金流水不符合数据规则，本次操作已全部回滚，请检查输入。", 400);
    }
    if (stage === "cash") {
      throw new ApiRequestError("INTERNAL_ERROR", "关联现金流水保存失败，本次操作已全部回滚，交易和现金余额未改变。请稍后重试。", 500);
    }
    throw new ApiRequestError("INTERNAL_ERROR", "交易保存失败，本次操作已全部回滚，交易和现金余额未改变。请稍后重试。", 500);
  }
  return data ? mapTransactionRow(data as InvestmentTransactionRow) : null;
}

function toTransactionUpdateRow(input: UpdateInvestmentTransactionInput) {
  return {
    ...(input.accountId !== undefined ? { account_id: input.accountId } : {}),
    ...(input.instrumentId !== undefined ? { instrument_id: input.instrumentId } : {}),
    ...(input.transactionType !== undefined ? { transaction_type: input.transactionType } : {}),
    ...(input.tradeDate !== undefined ? { trade_date: input.tradeDate } : {}),
    ...(input.settlementDate !== undefined ? { settlement_date: input.settlementDate } : {}),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.grossAmount !== undefined ? { gross_amount: input.grossAmount } : {}),
    ...(input.fee !== undefined ? { fee: input.fee } : {}),
    ...(input.tax !== undefined ? { tax: input.tax } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.adjustmentDirection !== undefined ? { adjustment_direction: input.adjustmentDirection } : {}),
    ...(input.transactionSource !== undefined ? { transaction_source: input.transactionSource } : {}),
    ...(input.linkedTransactionId !== undefined ? { linked_transaction_id: input.linkedTransactionId } : {}),
    ...(input.settlementCurrency !== undefined ? { settlement_currency: input.settlementCurrency } : {}),
    ...(input.settlementAmount !== undefined ? { settlement_amount: input.settlementAmount } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  };
}

export async function listGeneratedCashLegs(parentIds: string[]): Promise<InvestmentTransaction[]> {
  if (parentIds.length === 0) return [];
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.from("transactions").select(transactionSelect)
    .eq("transaction_source", "generated_cash_leg").in("linked_transaction_id", parentIds);
  if (error) throw new Error("Failed to list linked cash transactions.");
  return (data as unknown as InvestmentTransactionRow[]).map(mapTransactionRow);
}
