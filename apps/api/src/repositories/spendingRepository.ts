import type {
  AccountStatement,
  SpendingAccount,
  SpendingFilterOptions,
  SpendingQueryResult,
  StatementListResult,
  StatementRow,
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { ApiRequestError } from "../utils/apiError";

type SpendingTable =
  | "spending_accounts"
  | "account_statements"
  | "statement_rows";
export function checkSpendingError(error: { code?: string } | null): void {
  if (!error) return;
  if (error.code === "23505")
    throw new ApiRequestError("CONFLICT", "该账户在此账单日期已有账单。", 409);
  if (error.code === "23503")
    throw new ApiRequestError(
      "CONFLICT",
      "记录已被使用或关联记录不存在。",
      409,
    );
  if (error.code === "23514")
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      "数据不符合账单规则；已有明细的账单不能更换账户或币种。",
      400,
    );
  throw new Error("Spending database operation failed.");
}
export async function spendingAccounts(): Promise<SpendingAccount[]> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db
    .from("spending_accounts")
    .select("*")
    .order("name");
  checkSpendingError(error);
  return data as SpendingAccount[];
}
export async function spendingRecord(
  table: SpendingTable,
  id: string,
): Promise<Record<string, unknown>> {
  const db = await getSupabaseAdmin();
  const view =
    table === "account_statements"
      ? "spending_statement_details"
      : table === "statement_rows"
        ? "spending_row_details"
        : table;
  const { data, error } = await db
    .from(view)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  checkSpendingError(error);
  if (!data) throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
  return data as Record<string, unknown>;
}
export async function saveSpendingRecord(
  table: SpendingTable,
  id: string | undefined,
  values: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const db = await getSupabaseAdmin();
  const query = id
    ? db
        .from(table)
        .update({ ...values, updated_by_user_id: userId })
        .eq("id", id)
    : db
        .from(table)
        .insert({
          ...values,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        });
  const { data, error } = await query.select("id").maybeSingle();
  checkSpendingError(error);
  if (!data) throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
  return String(data.id);
}
export async function deleteSpendingRecord(
  table: SpendingTable,
  id: string,
  userId: string,
): Promise<void> {
  if (table === "statement_rows") {
    const db = await getSupabaseAdmin();
    const { data, error } = await db.rpc("delete_spending_row", {
      target_id: id,
      actor_id: userId,
    });
    checkSpendingError(error);
    if (!data) throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
    return;
  }
  const db = await getSupabaseAdmin();
  const { data, error } = await db
    .from(table)
    .delete()
    .eq("id", id)
    .select("id");
  checkSpendingError(error);
  if (!data?.length)
    throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
}
export async function spendingRows(
  filters: Record<string, string | number>,
): Promise<SpendingQueryResult> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("query_spending_rows", { filters });
  checkSpendingError(error);
  return data as SpendingQueryResult;
}
export async function spendingOptions(
  accountId?: string,
): Promise<SpendingFilterOptions> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("spending_filter_options", {
    account_id_filter: accountId ?? null,
  });
  checkSpendingError(error);
  return data as SpendingFilterOptions;
}
export async function spendingStatements(filters: {
  accountId?: string;
  month?: string;
  status?: string;
  limit: number;
  offset: number;
}): Promise<StatementListResult> {
  const db = await getSupabaseAdmin();
  let query = db
    .from("spending_statement_details")
    .select("*", { count: "exact" });
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.month) query = query.eq("month", filters.month);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error, count } = await query
    .order("statement_date", { ascending: false })
    .order("id", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);
  checkSpendingError(error);
  return {
    statements: data as AccountStatement[],
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      total: count ?? 0,
      hasMore: (count ?? 0) > filters.offset + filters.limit,
    },
  };
}
export async function getStatement(id: string): Promise<AccountStatement> {
  return (await spendingRecord(
    "account_statements",
    id,
  )) as unknown as AccountStatement;
}
export async function getSpendingRow(id: string): Promise<StatementRow> {
  return (await spendingRecord(
    "statement_rows",
    id,
  )) as unknown as StatementRow;
}
