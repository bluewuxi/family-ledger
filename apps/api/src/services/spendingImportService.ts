import { createHash, randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  AuthenticatedUser,
  SpendingAccount,
  SpendingEncoding,
  SpendingImportDecision,
} from "@family-ledger/shared";
import * as repo from "../repositories/spendingRepository";
import {
  invalid,
  record,
  uuid,
  textValue,
  classification,
  normalizeRow,
} from "./spendingValidation";
import { CSV_MAX_BYTES, parseBankCsv } from "./spendingCsvParser";
import { ApiRequestError } from "../utils/apiError";

const client = new S3Client({});
function bucket(): string {
  if (!process.env.STATEMENT_BUCKET_NAME)
    throw new ApiRequestError("INTERNAL_ERROR", "文件存储尚未配置。", 503);
  return process.env.STATEMENT_BUCKET_NAME;
}
export const importDependencies = {
  getBatch: repo.getStatement,
  getAccount: async (id: string) =>
    (await repo.spendingRecord(
      "spending_accounts",
      id,
    )) as unknown as SpendingAccount,
  rpc: repo.spendingRpc,
  head: (Bucket: string, Key: string) =>
    client.send(new HeadObjectCommand({ Bucket, Key })),
  read: async (Bucket: string, Key: string, VersionId: string) => {
    const result = await client.send(
      new GetObjectCommand({ Bucket, Key, VersionId }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) invalid("文件内容为空。");
    return bytes;
  },
  copy: async (
    Bucket: string,
    Key: string,
    source: string,
    version: string,
  ) => {
    const result = await client.send(
      new CopyObjectCommand({
        Bucket,
        Key,
        CopySource: `${Bucket}/${source.split("/").map(encodeURIComponent).join("/")}?versionId=${encodeURIComponent(version)}`,
      }),
    );
    if (!result.VersionId) invalid("文件存储必须启用版本管理。");
    return result.VersionId;
  },
};
export async function beginCsvUpload(id: string, input: unknown) {
  const batch = await repo.getStatement(uuid(id));
  if (
    !["draft", "preview"].includes(batch.status) ||
    new Date(batch.expires_at).getTime() < Date.now()
  )
    invalid("导入已结束或过期，请新建导入。");
  const body = record(input),
    filename = textValue(body.filename, "文件名", 180)!;
  if (!filename.toLowerCase().endsWith(".csv")) invalid("请选择 CSV 文件。");
  if (
    typeof body.size !== "number" ||
    !Number.isInteger(body.size) ||
    body.size < 1 ||
    body.size > CSV_MAX_BYTES
  )
    invalid("CSV 最大 2 MiB。");
  if (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(body.sha256))
    invalid("文件校验值无效。");
  const key = `statements/pending/${id}/${randomUUID()}.csv`;
  const fields = {
    "Content-Type": "text/csv",
    "x-amz-meta-sha256": body.sha256,
    "x-amz-meta-filename": Buffer.from(filename).toString("base64"),
  };
  return {
    ...(await createPresignedPost(client, {
      Bucket: bucket(),
      Key: key,
      Expires: 300,
      Fields: fields,
      Conditions: [
        ["content-length-range", body.size, body.size],
        ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
      ],
    })),
    key,
  };
}
export async function previewCsv(
  id: string,
  input: unknown,
  user: AuthenticatedUser,
  deps = importDependencies,
) {
  const batch = await deps.getBatch(uuid(id)),
    body = record(input),
    key = textValue(body.key, "文件编号", 240)!;
  if (!new RegExp(`^statements/pending/${id}/[0-9a-f-]{36}\\.csv$`).test(key))
    invalid("文件不属于此导入。");
  const head = await deps.head(bucket(), key);
  if (
    !head.VersionId ||
    !head.ContentLength ||
    head.ContentLength > CSV_MAX_BYTES ||
    head.ContentType !== "text/csv"
  )
    invalid("上传文件无效。");
  const bytes = await deps.read(bucket(), key, head.VersionId),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== head.Metadata?.sha256 || !head.Metadata?.filename)
    invalid("文件校验失败，请重新上传。");
  const account = await deps.getAccount(batch.account_id);
  const preview = parseBankCsv(
    bytes,
    account,
    body.encoding as SpendingEncoding | undefined,
  );
  const counts = await deps.rpc<Record<string, number>>(
    "spending_duplicate_counts",
    {
      aid: account.id,
      fingerprints: [...new Set(preview.rows.map((r) => r.fingerprint))],
    },
  );
  preview.rows.forEach((r) => (r.duplicate_count = counts[r.fingerprint] ?? 0));
  await deps.rpc("set_spending_preview", {
    batch_id: id,
    payload: {
      preview,
      key,
      version: head.VersionId,
      filename: Buffer.from(head.Metadata.filename, "base64").toString("utf8"),
      sha256: hash,
    },
    actor_id: user.id,
  });
  return deps.getBatch(id);
}
export async function commitCsv(
  id: string,
  input: unknown,
  user: AuthenticatedUser,
  deps = importDependencies,
) {
  const batch = await deps.getBatch(uuid(id)),
    body = record(input),
    token = uuid(body.token);
  if (
    batch.preview_token !== token ||
    !batch.preview ||
    !batch.csv_file_key ||
    !batch.csv_file_version
  )
    invalid("预览已变化，请重新加载。");
  if (
    !Array.isArray(body.choices) ||
    body.choices.length !== batch.preview.rows.length
  )
    invalid("每条交易都需要导入选择。");
  const seen = new Set<number>();
  const rowsByNumber = new Map(
    batch.preview.rows.map((row) => [row.row_number, row]),
  );
  const choices: SpendingImportDecision[] = body.choices
    .map((item) => {
      const d = record(item),
        r =
          typeof d.row_number === "number"
            ? rowsByNumber.get(d.row_number)
            : undefined;
      if (
        !r ||
        seen.has(r.row_number) ||
        typeof d.skip !== "boolean" ||
        typeof d.allow_duplicate !== "boolean"
      )
        invalid("导入选择无效。");
      seen.add(r.row_number);
      const c = classification(d.classification),
        tag = textValue(d.tag, "标签", 80, true);
      if (!d.skip)
        normalizeRow({
          ...r,
          account_id: batch.account_id,
          classification: c,
          tag,
        });
      return {
        row_number: r.row_number,
        skip: d.skip,
        allow_duplicate: d.allow_duplicate,
        classification: c,
        tag,
      };
    })
    .sort((a, b) => a.row_number - b.row_number);
  if (batch.preview.errors.length) invalid("请修正 CSV 中的错误后重新上传。");
  if (
    !["preview", "committed"].includes(batch.status) ||
    (batch.status !== "committed" &&
      new Date(batch.expires_at).getTime() < Date.now())
  )
    invalid("导入预览已过期或已撤销。");
  const key = `statements/${id}/${token}.csv`;
  const version =
    batch.status === "committed"
      ? batch.csv_file_version
      : await deps.copy(
          bucket(),
          key,
          batch.csv_file_key,
          batch.csv_file_version,
        );
  await deps.rpc("commit_spending_import", {
    batch_id: id,
    token,
    choices,
    actor_id: user.id,
    permanent_key: key,
    permanent_version: version,
  });
  return deps.getBatch(id);
}
export async function undoCsv(
  id: string,
  input: unknown,
  user: AuthenticatedUser,
) {
  const body = record(input);
  if (
    body.confirm_edited !== undefined &&
    typeof body.confirm_edited !== "boolean"
  )
    invalid("确认标记无效。");
  return {
    removed: await repo.spendingRpc<number>("undo_spending_import", {
      batch_id: uuid(id),
      actor_id: user.id,
      confirm_edited: body.confirm_edited ?? false,
    }),
  };
}
export async function viewCsv(id: string) {
  const batch = await repo.getStatement(uuid(id));
  if (!batch.csv_file_key || !batch.csv_file_version)
    invalid("没有 CSV 源文件。");
  return {
    url: await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket(),
        Key: batch.csv_file_key,
        VersionId: batch.csv_file_version,
        ResponseContentType: "application/octet-stream",
        ResponseContentDisposition: "attachment",
      }),
      { expiresIn: 300 },
    ),
  };
}
