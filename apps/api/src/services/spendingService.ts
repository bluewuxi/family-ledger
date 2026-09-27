import type { AuthenticatedUser } from "@family-ledger/shared";
import * as repo from "../repositories/spendingRepository";
import {
  invalid,
  normalizeAccount,
  normalizeQuery,
  normalizeRow,
  pagination,
  record,
  uuid,
  classification,
  textValue,
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
export async function saveStatement(input: unknown, user: AuthenticatedUser) {
  const body = record(input),
    account_id = uuid(body.account_id);
  if (
    body.document_only !== undefined &&
    typeof body.document_only !== "boolean"
  )
    invalid("附件类型标记无效。");
  const account = await repo.spendingRecord("spending_accounts", account_id);
  if (!account.is_active) invalid("请选择启用的账户。");
  const key = await repo.saveSpendingRecord(
    "account_statements",
    undefined,
    { account_id, status: body.document_only === true ? "document" : "draft" },
    user.id,
  );
  return repo.getStatement(key);
}
export async function saveRow(
  input: unknown,
  user: AuthenticatedUser,
  id?: string,
) {
  const old = id ? await repo.spendingRecord("statement_rows", uuid(id)) : {};
  const body = record(input);
  if (id && body.account_id !== undefined && body.account_id !== old.account_id)
    invalid("不能更换交易所属账户。");
  const values = normalizeRow({ ...old, ...body });
  const account = await repo.spendingRecord(
    "spending_accounts",
    String(values.account_id),
  );
  if (!account.is_active) invalid("账户已停用。");
  const key = await repo.saveSpendingRecord(
    "statement_rows",
    id,
    values,
    user.id,
  );
  return repo.getSpendingRow(key);
}
export async function bulkRows(input: unknown, user: AuthenticatedUser) {
  const body = record(input);
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 200)
    invalid("请选择 1–200 条交易。");
  const ids = [...new Set(body.ids.map(uuid))],
    changes: Record<string, unknown> = {};
  if (body.classification !== undefined)
    changes.classification = classification(body.classification);
  if (body.tag !== undefined)
    changes.tag = textValue(body.tag, "标签", 80, true);
  if (!Object.keys(changes).length) invalid("请选择要更改的归类或标签。");
  return {
    updated: await repo.spendingRpc<number>("bulk_classify_spending", {
      ids,
      changes,
      actor_id: user.id,
    }),
  };
}
export async function listStatements(
  query: Record<string, string | undefined>,
) {
  if (
    query.status &&
    !["draft", "preview", "committed", "undone", "document"].includes(
      query.status,
    )
  )
    invalid("导入状态无效。");
  return repo.spendingStatements({
    ...pagination(query),
    accountId: query.accountId ? uuid(query.accountId) : undefined,
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
  kind: "accounts" | "rows",
  id: string,
  user: AuthenticatedUser,
) {
  await repo.deleteSpendingRecord(
    kind === "accounts" ? "spending_accounts" : "statement_rows",
    uuid(id),
    user.id,
  );
  return { deleted: true };
}
