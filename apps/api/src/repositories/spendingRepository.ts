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
const batchColumns: string =
  "id,account_id,account_name,status,created_at,expires_at,encoding,parser_version,csv_file_key,csv_file_version,csv_file_name,csv_sha256,source_file_key,source_file_version,source_file_name,source_file_size,file_sha256,row_count,total_count,cancelled_at,edited_count,imported_count,skipped_count,rejected_count,date_from,date_to,preview_token";
export function checkSpendingError(error: { code?: string } | null): void {
  if (!error) return;
  if (error.code === "23505")
    throw new ApiRequestError(
      "CONFLICT",
      "文件已导入或记录重复，请刷新导入记录。",
      409,
    );
  if (error.code === "23503")
    throw new ApiRequestError(
      "CONFLICT",
      "记录已被使用或关联记录不存在。",
      409,
    );
  if (error.code === "23514")
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      "数据不符合规则，或预览已过期/交易已变化。请重新预览；已有记录的账户不能更换格式、币种或账号。",
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
    .select(table === "account_statements" ? `${batchColumns},preview` : "*")
    .eq("id", id)
    .maybeSingle();
  checkSpendingError(error);
  if (!data) throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
  return data as unknown as Record<string, unknown>;
}
export async function saveSpendingRecord(
  table: SpendingTable,
  id: string | undefined,
  values: Record<string, unknown>,
  userId: string,
): Promise<string> {
  if (table === "statement_rows") {
    return spendingRpc<string>("mutate_spending_row", {
      target_id: id ?? null,
      row_values: values,
      actor_id: userId,
      remove: false,
    });
  }
  const db = await getSupabaseAdmin();
  const query = id
    ? db
        .from(table)
        .update({ ...values, updated_by_user_id: userId })
        .eq("id", id)
    : db.from(table).insert({
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
    const { data, error } = await db.rpc("mutate_spending_row", {
      target_id: id,
      actor_id: userId,
      row_values: {},
      remove: true,
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
  status?: string;
  limit: number;
  offset: number;
}): Promise<StatementListResult> {
  const db = await getSupabaseAdmin();
  let query = db
    .from("spending_statement_details")
    .select(batchColumns, { count: "exact" });
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);
  checkSpendingError(error);
  return {
    statements: (
      (data ?? []) as unknown as Omit<AccountStatement, "preview">[]
    ).map((row) => ({
      ...row,
      preview: null,
    })),
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      total: count ?? 0,
      hasMore: (count ?? 0) > filters.offset + filters.limit,
    },
  };
}
export async function spendingRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc(name, args);
  checkSpendingError(error);
  return data as T;
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
