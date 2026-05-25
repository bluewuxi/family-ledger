import type {
  CreateInvestmentTransactionInput,
  InvestmentTransaction,
  TransactionSource,
  UpdateInvestmentTransactionInput
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface InvestmentTransactionRow {
  id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: InvestmentTransaction["transactionType"];
  trade_date: string;
  settlement_date: string | null;
  quantity: string | null;
  price: string | null;
  gross_amount: string | null;
  fee: string;
  tax: string;
  currency: InvestmentTransaction["currency"];
  adjustment_direction: InvestmentTransaction["adjustmentDirection"];
  transaction_source: TransactionSource;
  linked_transaction_id: string | null;
  settlement_currency: InvestmentTransaction["settlementCurrency"];
  settlement_amount: string | null;
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

export async function listTransactions(): Promise<InvestmentTransaction[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionSelect)
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to list transactions.");
  }

  return (data as unknown as InvestmentTransactionRow[]).map(mapTransactionRow);
}

export async function listTransactionsUntil(tradeDate: string): Promise<InvestmentTransaction[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionSelect)
    .lte("trade_date", tradeDate)
    .order("trade_date", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<InvestmentTransactionRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot transactions.");
  }

  return data.map(mapTransactionRow);
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

function mapTransactionRow(row: InvestmentTransactionRow): InvestmentTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    instrumentId: row.instrument_id,
    transactionType: row.transaction_type,
    tradeDate: row.trade_date,
    settlementDate: row.settlement_date,
    quantity: row.quantity,
    price: row.price,
    grossAmount: row.gross_amount,
    fee: row.fee,
    tax: row.tax,
    currency: row.currency,
    adjustmentDirection: row.adjustment_direction,
    transactionSource: row.transaction_source,
    linkedTransactionId: row.linked_transaction_id,
    settlementCurrency: row.settlement_currency,
    settlementAmount: row.settlement_amount,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toTransactionRow(input: CreateInvestmentTransactionInput) {
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
