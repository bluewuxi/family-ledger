import { createHash, randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AuthenticatedUser } from "@family-ledger/shared";
import {
  getStatement,
  saveSpendingRecord,
} from "../repositories/spendingRepository";
import { ApiRequestError } from "../utils/apiError";
import { invalid, record, textValue, uuid } from "./spendingValidation";

export const MAX_STATEMENT_PDF_BYTES = 10 * 1024 * 1024;
const client = new S3Client({});
// Injectable boundaries allow storage failure tests without AWS calls or live records.
export const attachmentDependencies = {
  getStatement,
  saveSpendingRecord,
  head: (Bucket: string, Key: string) =>
    client.send(new HeadObjectCommand({ Bucket, Key })),
  read: async (Bucket: string, Key: string, VersionId: string) => {
    const object = await client.send(
      new GetObjectCommand({ Bucket, Key, VersionId }),
    );
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) invalid("无法读取上传文件。");
    return bytes;
  },
  signRead: (Bucket: string, Key: string, VersionId: string | undefined) =>
    getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket,
        Key,
        VersionId,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: 300 },
    ),
};
function bucket(): string {
  const value = process.env.STATEMENT_BUCKET_NAME;
  if (!value)
    throw new ApiRequestError(
      "INTERNAL_ERROR",
      "PDF 存储尚未配置，请联系管理员。",
      503,
    );
  return value;
}
export function validatePdfBytes(
  bytes: Uint8Array,
  expectedHash: string,
): void {
  if (
    bytes.length < 5 ||
    bytes.length > MAX_STATEMENT_PDF_BYTES ||
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-"
  )
    invalid("文件不是有效的 PDF，或超过 10 MiB。");
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
    invalid("PDF 校验失败，请重新上传。");
}
export function validateAttachmentKey(id: string, key: unknown): string {
  const value = textValue(key, "文件编号", 200)!;
  if (!new RegExp(`^statements/${uuid(id)}/[0-9a-f-]{36}\\.pdf$`).test(value))
    invalid("文件不属于此账单。");
  return value;
}
export async function beginStatementUpload(id: string, input: unknown) {
  await getStatement(uuid(id));
  const body = record(input),
    name = textValue(body.filename, "文件名", 180)!;
  if (!name.toLowerCase().endsWith(".pdf")) invalid("仅支持 PDF 文件。");
  if (
    typeof body.size !== "number" ||
    !Number.isInteger(body.size) ||
    body.size < 5 ||
    body.size > MAX_STATEMENT_PDF_BYTES
  )
    invalid("PDF 最大为 10 MiB。");
  if (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(body.sha256))
    invalid("文件校验值无效。");
  const key = `statements/${id}/${randomUUID()}.pdf`;
  const fields = {
    "Content-Type": "application/pdf",
    "x-amz-meta-sha256": body.sha256,
    "x-amz-meta-filename": Buffer.from(name).toString("base64"),
  };
  const upload = await createPresignedPost(client, {
    Bucket: bucket(),
    Key: key,
    Expires: 300,
    Fields: fields,
    Conditions: [
      ["content-length-range", body.size, body.size],
      ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
    ],
  });
  return { ...upload, key };
}
export async function finishStatementUpload(
  id: string,
  input: unknown,
  user: AuthenticatedUser,
  deps = attachmentDependencies,
) {
  await deps.getStatement(uuid(id));
  const key = validateAttachmentKey(id, record(input).key),
    Bucket = bucket();
  try {
    const head = await deps.head(Bucket, key);
    if (
      !head.VersionId ||
      !head.ContentLength ||
      head.ContentLength > MAX_STATEMENT_PDF_BYTES ||
      head.ContentType !== "application/pdf"
    )
      invalid("上传文件无效。");
    const hash = head.Metadata?.sha256,
      encodedName = head.Metadata?.filename;
    if (!hash || !/^[0-9a-f]{64}$/.test(hash) || !encodedName)
      invalid("上传文件信息不完整。");
    const bytes = await deps.read(Bucket, key, head.VersionId);
    validatePdfBytes(bytes, hash);
    await deps.saveSpendingRecord(
      "account_statements",
      id,
      {
        source_file_key: key,
        source_file_version: head.VersionId,
        source_file_name: Buffer.from(encodedName, "base64").toString("utf8"),
        source_file_size: bytes.length,
        file_sha256: hash,
      },
      user.id,
    );
    return deps.getStatement(id);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      "无法确认 PDF 上传，请重试；原附件保持不变。",
      400,
    );
  }
}
export async function viewStatementAttachment(
  id: string,
  deps = attachmentDependencies,
) {
  const statement = await deps.getStatement(uuid(id));
  if (!statement.source_file_key)
    throw new ApiRequestError("NOT_FOUND", "此账单尚未添加 PDF。", 404);
  const url = await deps.signRead(
    bucket(),
    statement.source_file_key,
    statement.source_file_version ?? undefined,
  );
  return { url };
}
export async function removeStatementAttachment(
  id: string,
  user: AuthenticatedUser,
) {
  await getStatement(uuid(id));
  await saveSpendingRecord(
    "account_statements",
    id,
    {
      source_file_key: null,
      source_file_version: null,
      source_file_name: null,
      source_file_size: null,
      file_sha256: null,
    },
    user.id,
  );
  return { deleted: true };
}
