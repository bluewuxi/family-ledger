import type {
  AccountStatement,
  AuthenticatedUser,
  SpendingAccount,
  SpendingEncoding,
  SpendingFilterOptions,
  SpendingImportDecision,
  SpendingQueryResult,
  StatementListResult,
  StatementRow,
} from "@family-ledger/shared";
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from "./apiClient";
const root = "/spending";
async function upload(id: string, file: File, kind: "csv" | "pdf") {
  const max = kind === "csv" ? 2 : 10;
  if (
    !file.name.toLowerCase().endsWith(`.${kind}`) ||
    file.size > max * 1024 * 1024
  )
    throw new Error(`请选择不超过 ${max} MiB 的 ${kind.toUpperCase()} 文件。`);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const result = await apiPost<{
    url: string;
    fields: Record<string, string>;
    key: string;
  }>(
    `${root}/statements/${id}/${kind === "csv" ? "csv-upload" : "attachment-upload"}`,
    { filename: file.name, size: file.size, sha256 },
  );
  const form = new FormData();
  Object.entries(result.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  const response = await fetch(result.url, { method: "POST", body: form });
  if (!response.ok) throw new Error("文件上传失败，请重试。");
  return result.key;
}
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
  createBatch: async (account_id: string, document_only = false) =>
    (
      await apiPost<{ statement: AccountStatement }>(`${root}/statements`, {
        account_id,
        document_only,
      })
    ).statement,
  uploadCsv: (id: string, file: File) => upload(id, file, "csv"),
  preview: async (id: string, key: string, encoding?: SpendingEncoding) =>
    (
      await apiPost<{ statement: AccountStatement }>(
        `${root}/statements/${id}/preview`,
        { key, encoding },
      )
    ).statement,
  commit: async (
    id: string,
    token: string,
    choices: SpendingImportDecision[],
  ) =>
    (
      await apiPost<{ statement: AccountStatement }>(
        `${root}/statements/${id}/commit`,
        { token, choices },
      )
    ).statement,
  cancel: async (id: string) => (await apiPost<{ statement: AccountStatement }>(
    `${root}/statements/${id}/cancel`, {},
  )).statement,
  undo: (id: string, confirm_edited: boolean) =>
    apiPost(`${root}/statements/${id}/undo`, { confirm_edited }),
  csvUrl: async (id: string) =>
    (await apiGet<{ url: string }>(`${root}/statements/${id}/csv`)).url,
  rows: (query: string) => apiGet<SpendingQueryResult>(`${root}/rows?${query}`),
  saveRow: async (values: unknown, id?: string) =>
    (
      await (id
        ? apiPatch<{ row: StatementRow }>(`${root}/rows/${id}`, values)
        : apiPost<{ row: StatementRow }>(`${root}/rows`, values))
    ).row,
  bulkRows: (values: unknown) => apiPatch(`${root}/rows`, values),
  deleteRow: (id: string) => apiDelete(`${root}/rows/${id}`),
  options: (accountId = "") =>
    apiGet<SpendingFilterOptions>(
      `${root}/filter-options?accountId=${encodeURIComponent(accountId)}`,
    ),
  pdfUrl: async (id: string) =>
    (await apiGet<{ url: string }>(`${root}/statements/${id}/attachment`)).url,
  removePdf: (id: string) => apiDelete(`${root}/statements/${id}/attachment`),
  uploadPdf: async (id: string, file: File) =>
    apiPut(`${root}/statements/${id}/attachment`, {
      key: await upload(id, file, "pdf"),
    }),
};
