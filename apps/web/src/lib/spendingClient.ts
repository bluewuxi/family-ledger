import type {
  AccountStatement,
  AuthenticatedUser,
  SpendingAccount,
  SpendingFilterOptions,
  SpendingQueryResult,
  StatementListResult,
  StatementRow,
} from "@family-ledger/shared";
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from "./apiClient";
const root = "/spending";
export const spendingClient = {
  accounts: () =>
    apiGet<{ user: AuthenticatedUser; accounts: SpendingAccount[] }>(
      `${root}/accounts`,
    ),
  saveAccount: (values: unknown, id?: string) =>
    id
      ? apiPatch(`${root}/accounts/${id}`, values)
      : apiPost(`${root}/accounts`, values),
  deleteAccount: (id: string) => apiDelete(`${root}/accounts/${id}`),
  statements: (query = "") =>
    apiGet<StatementListResult>(`${root}/statements?${query}`),
  statement: async (id: string) =>
    (await apiGet<{ statement: AccountStatement }>(`${root}/statements/${id}`))
      .statement,
  saveStatement: async (values: unknown, id?: string) =>
    (
      await (id
        ? apiPatch<{ statement: AccountStatement }>(
            `${root}/statements/${id}`,
            values,
          )
        : apiPost<{ statement: AccountStatement }>(
            `${root}/statements`,
            values,
          ))
    ).statement,
  deleteStatement: (id: string) => apiDelete(`${root}/statements/${id}`),
  rows: (query: string) => apiGet<SpendingQueryResult>(`${root}/rows?${query}`),
  saveRow: async (statementId: string, values: unknown, id?: string) =>
    (
      await (id
        ? apiPatch<{ row: StatementRow }>(`${root}/rows/${id}`, values)
        : apiPost<{ row: StatementRow }>(
            `${root}/statements/${statementId}/rows`,
            values,
          ))
    ).row,
  deleteRow: (id: string) => apiDelete(`${root}/rows/${id}`),
  options: (accountId = "") =>
    apiGet<SpendingFilterOptions>(
      `${root}/filter-options?accountId=${encodeURIComponent(accountId)}`,
    ),
  pdfUrl: async (id: string) =>
    (await apiGet<{ url: string }>(`${root}/statements/${id}/attachment`)).url,
  removePdf: (id: string) => apiDelete(`${root}/statements/${id}/attachment`),
  uploadPdf: async (id: string, file: File) => {
    if (
      file.size > 10 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith(".pdf")
    )
      throw new Error("请选择不超过 10 MiB 的 PDF。");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const sha256 = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const upload = await apiPost<{
      url: string;
      fields: Record<string, string>;
      key: string;
    }>(`${root}/statements/${id}/attachment-upload`, {
      filename: file.name,
      size: file.size,
      sha256,
    });
    const form = new FormData();
    Object.entries(upload.fields).forEach(([key, value]) =>
      form.append(key, value),
    );
    form.append("file", file);
    const response = await fetch(upload.url, { method: "POST", body: form });
    if (!response.ok) throw new Error("PDF 上传失败，请重试。原附件保持不变。");
    return apiPut(`${root}/statements/${id}/attachment`, { key: upload.key });
  },
};
export async function allSpendingStatements(): Promise<AccountStatement[]> {
  const statements: AccountStatement[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await spendingClient.statements(
      `limit=200&offset=${offset}`,
    );
    statements.push(...result.statements);
    if (!result.pagination.hasMore) return statements;
  }
}
