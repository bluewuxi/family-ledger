import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  normalizeQuery,
  normalizeRow,
  normalizeStatement,
} from "../apps/api/src/services/spendingValidation";
import {
  validateAttachmentKey,
  validatePdfBytes,
  MAX_STATEMENT_PDF_BYTES,
  finishStatementUpload,
  viewStatementAttachment,
  attachmentDependencies,
} from "../apps/api/src/services/spendingAttachmentService";
import { spendingRoute } from "../apps/api/src/routes/spendingRoutes";
import { ApiAuthError } from "../apps/api/src/auth/auth";
import { defaultSpendingInclusion } from "@family-ledger/shared";
import type { AccountStatement } from "@family-ledger/shared";
import { formatSpendingAmount } from "../apps/web/src/lib/spendingFormat";
import { route } from "../apps/api/src/routes/router";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

async function main() {
  assert.equal(
    formatSpendingAmount("99999999999999.999999"),
    "99,999,999,999,999.999999",
  );
  assert.equal(formatSpendingAmount("0.000001"), "0.000001");
  const input = {
    transaction_date: "2026-05-27",
    posting_date: "2026-05-28",
    suffix_number: "0175",
    description: "One NZ",
    original_currency: "NZD",
    original_amount: "12.00",
    settlement_amount: "48.20",
  };
  assert.equal(normalizeRow(input).is_spending, true);
  assert.equal(
    normalizeRow({ ...input, is_spending: false }).is_spending,
    false,
  );
  assert.equal(
    normalizeRow({
      ...input,
      transaction_type: "refund",
      original_amount: "-12",
      settlement_amount: "-48.20",
    }).is_spending,
    false,
  );
  assert.equal(
    normalizeRow({
      ...input,
      transaction_type: "refund",
      original_amount: "-12",
      settlement_amount: "-48.20",
      is_spending: true,
    }).is_spending,
    true,
  );
  assert.equal(
    normalizeRow({
      ...input,
      transaction_type: "adjustment",
      original_amount: "0",
      settlement_amount: "0",
    }).is_spending,
    false,
  );
  for (const invalidFlag of [null, "false", 0, 1])
    assert.throws(() => normalizeRow({ ...input, is_spending: invalidFlag }));
  const savedRow = normalizeRow({ ...input, is_spending: false });
  assert.equal(
    normalizeRow({ ...savedRow, settlement_amount: "500" }).is_spending,
    false,
  );
  const savedIncluded = normalizeRow(input);
  assert.equal(
    normalizeRow({
      ...savedIncluded,
      transaction_type: "refund",
      original_amount: "-1",
      settlement_amount: "-1",
    }).is_spending,
    true,
  );
  assert.equal(normalizeQuery({ isSpending: "false" }).isSpending, "false");
  assert.equal(normalizeQuery({ isSpending: "true" }).isSpending, "true");
  assert.throws(() => normalizeQuery({ isSpending: "yes" }));
  assert.throws(() => normalizeQuery({ isSpending: "" }));
  for (const value of ["0", "0.000000", "-1", "-0", ""])
    assert.equal(defaultSpendingInclusion(value), false);
  for (const value of ["0.000001", "12", "99999999999999.999999"])
    assert.equal(defaultSpendingInclusion(value), true);
  assert.equal(normalizeRow(input).transaction_type, "purchase");
  assert.equal(normalizeRow(input).suffix_number, "0175");
  assert.equal(
    normalizeRow({ ...input, settlement_amount: "99999999999999.999999" })
      .settlement_amount,
    "99999999999999.999999",
  );
  for (const type of ["fee", "interest", "cash_advance"])
    assert.equal(
      normalizeRow({ ...input, transaction_type: type }).transaction_type,
      type,
    );
  for (const type of ["refund", "repayment", "cashback"])
    assert.equal(
      normalizeRow({
        ...input,
        transaction_type: type,
        original_amount: "-12",
        settlement_amount: "-48.20",
      }).transaction_type,
      type,
    );
  assert.throws(() => normalizeRow({ ...input, settlement_amount: "-1" }));
  assert.throws(() => normalizeRow({ ...input, settlement_amount: "0" }));
  assert.throws(() => normalizeRow({ ...input, transaction_type: "refund" }));
  assert.throws(() =>
    normalizeRow({ ...input, original_amount: "0", transaction_type: "fee" }),
  );
  assert.throws(() => normalizeRow({ ...input, original_amount: 12 }));
  assert.throws(() =>
    normalizeRow({ ...input, settlement_amount: "1.1234567" }),
  );
  assert.equal(
    normalizeRow({
      ...input,
      transaction_type: "adjustment",
      original_amount: "0",
      settlement_amount: "0",
      tag: "  ",
    }).tag,
    null,
  );
  assert.throws(() =>
    normalizeRow({ ...input, transaction_date: "2026-02-30" }),
  );
  assert.throws(() => normalizeQuery({ month: "2026-06", from: "2026-06-01" }));
  assert.throws(() => normalizeQuery({ tag: "食品", untagged: "true" }));
  assert.throws(() => normalizeQuery({ from: "2026-06-02", to: "2026-06-01" }));
  assert.throws(() => normalizeQuery({ limit: "201" }));
  assert.throws(() => normalizeQuery({ offset: "-1" }));
  assert.equal(normalizeQuery({ month: "2024-02" }).to, "2024-02-29");
  assert.equal(normalizeQuery({ month: "2026-02" }).to, "2026-02-28");
  const id = "00000000-0000-4000-8000-000000000001";
  const statementInput = {account_id:id,statement_date:"2026-06-27",period_start:"2026-05-28",period_end:"2026-06-27",currency:"CNY"};
  for (const field of ["opening_balance", "closing_balance", "charges_total", "credits_total"]) {
    assert.throws(() => normalizeStatement({...statementInput,[field]:"100"}));
    assert.equal(field in normalizeStatement(statementInput), false);
  }
  assert.equal(
    normalizeStatement({
      account_id: id,
      statement_date: "2026-06-27",
      period_start: "2026-05-28",
      period_end: "2026-06-27",
      currency: "CNY",
    }).month,
    "2026-06-01",
  );
  const pdf = Buffer.from("%PDF-1.7\nfixture"),
    hash = createHash("sha256").update(pdf).digest("hex");
  validatePdfBytes(pdf, hash);
  assert.throws(() => validatePdfBytes(Buffer.from("hello"), hash));
  assert.throws(() => validatePdfBytes(pdf, "0".repeat(64)));
  assert.throws(() =>
    validatePdfBytes(Buffer.alloc(MAX_STATEMENT_PDF_BYTES + 1), hash),
  );
  assert.throws(() =>
    validateAttachmentKey(
      id,
      `statements/00000000-0000-4000-8000-000000000002/${id}.pdf`,
    ),
  );
  validateAttachmentKey(id, `statements/${id}/${id}.pdf`);
  const user = { id, email: "fixture@example.invalid", role: "admin" as const };
  const originalBucket = process.env.STATEMENT_BUCKET_NAME;
  process.env.STATEMENT_BUCKET_NAME = "test-only-no-network";
  let saved: Record<string, unknown> | undefined;
  const statement = {
    id,
    source_file_key: "previous.pdf",
    source_file_version: "previous-version",
  } as AccountStatement;
  const deps: typeof attachmentDependencies = {
    getStatement: async () => statement,
    saveSpendingRecord: async (_table, _id, values) => {
      saved = values;
      return id;
    },
    head: async () => ({
      $metadata: {},
      VersionId: "verified-version",
      ContentLength: pdf.length,
      ContentType: "application/pdf",
      Metadata: {
        sha256: hash,
        filename: Buffer.from("statement.pdf").toString("base64"),
      },
    }),
    read: async (_bucket, _key, version) => {
      assert.equal(version, "verified-version");
      return pdf;
    },
    signRead: async (_bucket, key, version) => {
      assert.equal(key, "previous.pdf");
      assert.equal(version, "previous-version");
      return "https://example.invalid/short-lived-link";
    },
  };
  try {
    await assert.rejects(
      finishStatementUpload(id, { key: `statements/${id}/${id}.pdf` }, user, {
        ...deps,
        head: async () => {
          throw new Error("S3 unavailable");
        },
      }),
    );
    assert.equal(saved, undefined);
    await assert.rejects(
      finishStatementUpload(id, { key: `statements/${id}/${id}.pdf` }, user, {
        ...deps,
        read: async () => Buffer.from("not a PDF"),
      }),
    );
    assert.equal(saved, undefined);
    await finishStatementUpload(
      id,
      { key: `statements/${id}/${id}.pdf` },
      user,
      deps,
    );
    assert.equal(saved?.source_file_version, "verified-version");
    assert.equal(saved?.file_sha256, hash);
    assert.equal(
      (await viewStatementAttachment(id, deps)).url,
      "https://example.invalid/short-lived-link",
    );
    await assert.rejects(
      viewStatementAttachment(id, {
        ...deps,
        getStatement: async () => {
          throw new Error("Statement not found");
        },
      }),
    );
  } finally {
    if (originalBucket === undefined) delete process.env.STATEMENT_BUCKET_NAME;
    else process.env.STATEMENT_BUCKET_NAME = originalBucket;
  }
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const event = {
      rawPath: `/spending/statements/${id}/attachment`,
      headers: {},
      requestContext: { http: { method } },
    } as APIGatewayProxyEventV2;
    await assert.rejects(
      spendingRoute(event, async (_event, role) => {
        assert.equal(role, "admin");
        throw new ApiAuthError("Admin required", 403);
      }),
      (error) => error instanceof ApiAuthError && error.statusCode === 403,
    );
  }
  for (const [method, path] of [
    ["GET", "/spending/rows"],
    ["POST", "/spending/accounts"],
    ["POST", `/spending/statements/${id}/attachment-upload`],
    ["PUT", `/spending/statements/${id}/attachment`],
    ["GET", `/spending/statements/${id}/attachment`],
    ["DELETE", `/spending/statements/${id}`],
  ]) {
    const event = {
      rawPath: path,
      headers: {},
      requestContext: { http: { method } },
    } as APIGatewayProxyEventV2;
    assert.equal((await route(event)).statusCode, 401);
  }
  console.log(
    "Spending validation, date policy, PDF integrity, and unauthenticated route checks passed.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
