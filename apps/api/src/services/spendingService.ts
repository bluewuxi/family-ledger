import type { AuthenticatedUser } from "@family-ledger/shared";
import * as repo from "../repositories/spendingRepository";
import {
  invalid,
  monthValue,
  normalizeAccount,
  normalizeQuery,
  normalizeRow,
  normalizeStatement,
  pagination,
  record,
  uuid,
} from "./spendingValidation";

export const listSpendingAccounts = repo.spendingAccounts;
export async function saveSpendingAccount(
  input: unknown,
  user: AuthenticatedUser,
  id?: string,
) {
  const old = id
    ? await repo.spendingRecord("spending_accounts", uuid(id))
    : {};
  const key = await repo.saveSpendingRecord(
    "spending_accounts",
    id,
    normalizeAccount({ ...old, ...record(input) }),
    user.id,
  );
  return repo.spendingRecord("spending_accounts", key);
}
export async function saveStatement(
  input: unknown,
  user: AuthenticatedUser,
  id?: string,
) {
  const old = id
    ? await repo.spendingRecord("account_statements", uuid(id))
    : {};
  const values = normalizeStatement({ ...old, ...record(input) });
  const account = await repo.spendingRecord(
    "spending_accounts",
    String(values.account_id),
  );
  if ((!id || values.account_id !== old.account_id) && !account.is_active)
    invalid("请选择启用的消费账户。");
  const key = await repo.saveSpendingRecord(
    "account_statements",
    id,
    values,
    user.id,
  );
  return repo.getStatement(key);
}
export async function saveRow(
  input: unknown,
  user: AuthenticatedUser,
  statementId?: string,
  id?: string,
) {
  const old = id ? await repo.spendingRecord("statement_rows", uuid(id)) : {};
  const body = record(input);
  if (
    id &&
    body.statement_id !== undefined &&
    body.statement_id !== old.statement_id
  )
    invalid("不能移动账单明细。");
  const sid = uuid(statementId ?? old.statement_id);
  await repo.getStatement(sid);
  const values = normalizeRow({ ...old, ...body });
  const key = await repo.saveSpendingRecord(
    "statement_rows",
    id,
    id ? values : { ...values, statement_id: sid },
    user.id,
  );
  return repo.getSpendingRow(key);
}
export async function listStatements(
  query: Record<string, string | undefined>,
) {
  if (query.status && !["entering", "complete"].includes(query.status))
    invalid("账单状态无效。");
  return repo.spendingStatements({
    ...pagination(query),
    accountId: query.accountId ? uuid(query.accountId) : undefined,
    month: query.month ? monthValue(query.month) : undefined,
    status: query.status,
  });
}
export async function queryRows(query: Record<string, string | undefined>) {
  return repo.spendingRows(normalizeQuery(query));
}
export async function filterOptions(query: Record<string, string | undefined>) {
  return repo.spendingOptions(
    query.accountId ? uuid(query.accountId) : undefined,
  );
}
export async function statementDetail(id: string) {
  return repo.getStatement(uuid(id));
}
export async function removeSpendingRecord(
  kind: "accounts" | "statements" | "rows",
  id: string,
  user: AuthenticatedUser,
) {
  await repo.deleteSpendingRecord(
    kind === "accounts"
      ? "spending_accounts"
      : kind === "statements"
        ? "account_statements"
        : "statement_rows",
    uuid(id),
    user.id,
  );
  return { deleted: true };
}
