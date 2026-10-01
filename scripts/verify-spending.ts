import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import {
  bankDate,
  decodeBankCsv,
  parseBankCsv,
  CSV_MAX_BYTES,
} from "../apps/api/src/services/spendingCsvParser";
import {
  normalizeAccount,
  normalizeQuery,
  normalizeRow,
} from "../apps/api/src/services/spendingValidation";
import {
  validatePdfBytes,
  validateAttachmentKey,
  finishStatementUpload,
  attachmentDependencies,
} from "../apps/api/src/services/spendingAttachmentService";
import {
  previewCsv,
  commitCsv,
  importDependencies,
} from "../apps/api/src/services/spendingImportService";
import { spendingRoute } from "../apps/api/src/routes/spendingRoutes";
import type {
  SpendingAccount,
  SpendingFormat,
  AccountStatement,
  AuthenticatedUser,
  SpendingPreview,
} from "@family-ledger/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// Synthetic examples only: no personal source files or bank identifiers.
export const fixtures: Record<SpendingFormat, string> = {
  ccb_debit:
    "开户网点：测试\r\n账　　号：********1234\r\n记账日,交易日期,交易时间,支出,收入,账户余额,币种,摘要,对方账号,对方户名,交易地点\r\n20260924,20260923,08:06:45,,10.25,100,人民币,利息存入,,,\r\n20260924,20260924,09:00:00,15,,85,人民币,转账支取,****9876,测试账户,测试银行\r\n20260925,20260925,08:00:00,,1000,1085,人民币,理财产品赎回,,测试,地点,extra,additional\r\n",
  ccb_credit:
    ",,,,,,\r\n中国建设银行,,,,,,\r\n 交易日, 入账日, 信用卡卡号, 类型, 入账币种, 入账金额,交易描述\r\n20260924,20260925,'********1234,消费    ,人民币,23.10,\"测试商店, 分店\"\r\n,,,,,,\r\n20260925,20260925,'********1234,存入,人民币,-23.10,手机银行 转账还款\r\n20260926,20260926,'********1234,退货,人民币,-2.10,退款\r\n",
  bnz: 'Date,Amount,Payee,Particulars,Code,Reference,Tran Type,This Party Account,Other Party Account,Serial,Transaction Code,Batch Number,Originating Bank/Branch,Processed Date\r\n01/02/26,-12.30,"Sample, Store",,,ref1,POS,**1234,---,,00,1000,00-0000,02/02/26\r\n25/09/26,100,Employer,,IPAYROLL,ref2,DC,**1234,---,,00,1001,00-0000,25/09/26\r\n25/09/26,500,Example,,Transfer,ref3,BP,**1234,---,,00,1002,00-0000,25/09/26\r\n',
};
export const account = (format: SpendingFormat): SpendingAccount => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Example",
  source_format: format,
  default_currency: format === "bnz" ? "NZD" : "CNY",
  identity_suffix: "1234",
  is_active: true,
});
async function main() {
  for (const format of Object.keys(fixtures) as SpendingFormat[]) {
    for (const encoding of ["utf8", "gb18030", "utf16-le", "utf16-be"])
      for (const bom of [false, true]) {
        const bytes = iconv.encode(fixtures[format], encoding, { addBOM: bom });
        const r = parseBankCsv(bytes, account(format));
        assert.equal(r.rows.length, 3, `${format}/${encoding}/${bom}`);
        assert.equal(r.errors.length, 0);
        assert.equal(
          r.rows[0].transaction_date,
          format === "bnz"
            ? "2026-02-01"
            : format === "ccb_debit"
              ? "2026-09-23"
              : "2026-09-24",
        );
      }
  }
  assert.equal(bankDate("01/02/26", "bnz"), "2026-02-01");
  assert.equal(bankDate("31/12/99", "bnz"), "2099-12-31");
  assert.equal(bankDate("20240229", "ccb_debit"), "2024-02-29");
  for (const raw of ["29/02/25", "13/25/26", "20260924"])
    assert.throws(() => bankDate(raw, "bnz"));
  assert.throws(() => bankDate("20260229", "ccb_credit"));
  const debit = parseBankCsv(
    Buffer.from(fixtures.ccb_debit),
    account("ccb_debit"),
  );
  assert.equal(debit.rows[0].amount, "10.25");
  assert.equal(debit.rows[0].classification, "income");
  assert.equal(debit.rows[1].amount, "-15");
  assert.equal(debit.rows[1].classification, "review");
  assert.equal(debit.rows[2].classification, "excluded");
  assert.equal(debit.warnings.length, 1);
  assert.deepEqual(debit.rows[2].source_metadata.extra_fields, [
    "extra",
    "additional",
  ]);
  const credit = parseBankCsv(
    iconv.encode(fixtures.ccb_credit, "gb18030"),
    account("ccb_credit"),
  );
  assert.equal(credit.rows[0].amount, "-23.1");
  assert.equal(credit.rows[0].classification, "spending");
  assert.equal(credit.rows[1].classification, "excluded");
  assert.equal(credit.rows[2].classification, "refund");
  for (const prefix of ["*", "  *", "\t * \t", "　**　"]) {
    for (const encoding of ["utf8", "gb18030", "utf16-le", "utf16-be"]) {
      const marked = parseBankCsv(
        iconv.encode(
          fixtures.ccb_credit.replace("20260924,", `${prefix}20260924,`),
          encoding,
          { addBOM: true },
        ),
        account("ccb_credit"),
      );
      assert.equal(marked.errors.length, 0, `${prefix}/${encoding}`);
      assert.equal(marked.rows.length, credit.rows.length);
      assert.equal(marked.rows[0].transaction_date, "2026-09-24");
      assert.equal(marked.rows[0].fingerprint, credit.rows[0].fingerprint);
      assert.equal(marked.rows[0].amount, credit.rows[0].amount);
      assert.equal(marked.rows[0].source_metadata["交易日"], `${prefix}20260924`);
      assert.equal(marked.rows[0].source_metadata.card_number, "********1234");
    }
  }
  for (const invalidDate of ["*20260229", "*2026*0924", "*20260924*", "*"]) {
    const marked = parseBankCsv(
      Buffer.from(fixtures.ccb_credit.replace("20260924,", `${invalidDate},`)),
      account("ccb_credit"),
    );
    assert.equal(marked.errors.length, 1);
    assert.equal(marked.rows.length, 2);
  }
  const bnz = parseBankCsv(Buffer.from(fixtures.bnz), account("bnz"));
  assert.equal(bnz.rows[0].classification, "spending");
  assert.equal(bnz.rows[1].classification, "income");
  assert.equal(bnz.rows[2].classification, "review");
  const identical = fixtures.bnz + fixtures.bnz.split("\r\n")[1] + "\r\n";
  const preserved = parseBankCsv(Buffer.from(identical), account("bnz"));
  assert.equal(preserved.rows.length, 4);
  assert.equal(preserved.rows[0].fingerprint, preserved.rows[3].fingerprint);
  assert.equal(
    parseBankCsv(
      Buffer.from(fixtures.bnz.replace("-12.30", "-12.3000")),
      account("bnz"),
    ).rows[0].fingerprint,
    bnz.rows[0].fingerprint,
  );
  const bad = parseBankCsv(
    Buffer.from(fixtures.bnz.replace("-12.30", "NaN")),
    account("bnz"),
  );
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.rows.length, 2);
  assert.equal(
    parseBankCsv(
      Buffer.from(fixtures.bnz.replace("Sample, Store", "Sample\nStore")),
      account("bnz"),
    ).rows.length,
    3,
  );
  assert.equal(
    parseBankCsv(
      Buffer.from(fixtures.bnz.replace("Sample, Store", 'Sample ""Store""')),
      account("bnz"),
    ).rows.length,
    3,
  );
  assert.equal(
    parseBankCsv(Buffer.from(fixtures.ccb_credit), {
      ...account("ccb_credit"),
      default_currency: "NZD",
    }).errors.length,
    3,
  );
  assert.equal(
    parseBankCsv(Buffer.from(fixtures.ccb_credit), {
      ...account("ccb_credit"),
      identity_suffix: "9999",
    }).errors.length,
    3,
  );
  assert.throws(() =>
    parseBankCsv(Buffer.from(fixtures.ccb_debit), {
      ...account("ccb_debit"),
      identity_suffix: "9999",
    }),
  );
  assert.throws(() =>
    decodeBankCsv(Buffer.from([0xef, 0xbb, 0xbf, 0xff]), "ccb_debit"),
  );
  assert.throws(() =>
    decodeBankCsv(Buffer.from([0xff, 0xfe, 0x00]), "ccb_debit"),
  );
  assert.throws(() =>
    decodeBankCsv(Buffer.from([0x81]), "ccb_debit", "gb18030"),
  );
  assert.throws(() =>
    decodeBankCsv(Buffer.from(fixtures.bnz + "\ufffd"), "bnz"),
  );
  assert.throws(() => decodeBankCsv(Buffer.alloc(CSV_MAX_BYTES + 1), "bnz"));
  assert.throws(() =>
    decodeBankCsv(
      iconv.encode(fixtures.ccb_debit, "utf16-le", { addBOM: true }),
      "ccb_debit",
      "utf-8",
    ),
  );
  const ambiguous = Buffer.from(
    fixtures.bnz.replace("Sample, Store", "中文商店"),
    "utf8",
  );
  assert.throws(() => decodeBankCsv(ambiguous, "bnz"), /多种可能/);
  assert.equal(
    parseBankCsv(ambiguous, account("bnz"), "utf-8").rows[0].description,
    "中文商店 · ref1",
  );
  assert.equal(
    normalizeRow({
      account_id: account("bnz").id,
      transaction_date: "2026-09-24",
      description: "test",
      amount: "-99999999999999.999999",
      classification: "spending",
    }).amount,
    "-99999999999999.999999",
  );
  assert.throws(() =>
    normalizeRow({
      account_id: account("bnz").id,
      transaction_date: "2026-09-24",
      description: "test",
      amount: "-1",
      classification: "income",
    }),
  );
  assert.throws(() =>
    normalizeAccount({ ...account("bnz"), source_format: "other" }),
  );
  assert.equal(normalizeQuery({ month: "2026-02" }).to, "2026-02-28");
  assert.throws(() => normalizeQuery({ month: "2026-02", from: "2026-02-01" }));
  assert.throws(() => normalizeQuery({ classification: "purchase" }));
  const pdf = Buffer.from("%PDF-1.7\ntest");
  validatePdfBytes(pdf, createHash("sha256").update(pdf).digest("hex"));
  assert.throws(() => validatePdfBytes(Buffer.from("not pdf"), "0".repeat(64)));
  assert.throws(() =>
    validateAttachmentKey(account("bnz").id, "statements/other/file.pdf"),
  );
  for (const method of ["POST", "PATCH", "DELETE", "GET"]) {
    let required = "";
    await spendingRoute(
      {
        rawPath: "/spending/unknown",
        requestContext: { http: { method } },
      } as APIGatewayProxyEventV2,
      async (_e, role) => {
        required = role;
        return {
          id: account("bnz").id,
          role: "admin",
          email: "test@example.invalid",
        };
      },
    );
    assert.equal(required, method === "GET" ? "viewer" : "admin");
  }
  const actor: AuthenticatedUser = {
    id: account("bnz").id,
    role: "admin",
    email: "test@example.invalid",
  };
  const id = actor.id,
    key = `statements/pending/${id}/${id}.csv`,
    pdfKey = key.replace(".csv", ".pdf");
  let batch = {
    id,
    account_id: id,
    status: "draft",
    expires_at: "2099-01-01T00:00:00Z",
    preview: null,
    preview_token: null,
  } as AccountStatement;
  let commitCount = 0;
  const csvBytes = Buffer.from(fixtures.bnz),
    csvHash = createHash("sha256").update(csvBytes).digest("hex");
  const priorBucket = process.env.STATEMENT_BUCKET_NAME;
  process.env.STATEMENT_BUCKET_NAME = "synthetic-test-only";
  const deps = {
    ...importDependencies,
    getBatch: async () => batch,
    getAccount: async () => account("bnz"),
    head: async () => ({
      $metadata: {},
      VersionId: "exact-upload-version",
      ContentLength: csvBytes.length,
      ContentType: "text/csv",
      Metadata: {
        sha256: csvHash,
        filename: Buffer.from("sample.csv").toString("base64"),
      },
    }),
    read: async (_b: string, _k: string, v: string) => {
      assert.equal(v, "exact-upload-version");
      return csvBytes;
    },
    copy: async (_b: string, _k: string, _s: string, v: string) => {
      assert.equal(v, "exact-upload-version");
      return "permanent-version";
    },
    rpc: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      if (name === "spending_duplicate_counts") return {} as T;
      if (name === "set_spending_preview") {
        const p = args.payload as { preview: SpendingPreview };
        batch = {
          ...batch,
          status: "preview",
          preview: p.preview,
          preview_token: id,
          csv_file_key: key,
          csv_file_version: "exact-upload-version",
        };
        return id as T;
      }
      if (name === "commit_spending_import") {
        assert.equal(args.permanent_version, "permanent-version");
        commitCount++;
        batch = {
          ...batch,
          status: "committed",
          csv_file_version: "permanent-version",
        };
        return id as T;
      }
      throw new Error("Unexpected RPC");
    },
  };
  try {
    await assert.rejects(() =>
      previewCsv(id, { key: "statements/another/file.csv" }, actor, deps),
    );
    await assert.rejects(() =>
      previewCsv(id, { key }, actor, {
        ...deps,
        head: async () => ({
          ...(await deps.head()),
          Metadata: { sha256: "0".repeat(64), filename: "dGVzdA==" },
        }),
      }),
    );
    await previewCsv(id, { key }, actor, deps);
    assert.equal(batch.preview?.rows.length, 3);
    const cs = batch.preview!.rows.map((r) => ({
      row_number: r.row_number,
      skip: false,
      classification: r.classification,
      tag: null,
      allow_duplicate: false,
    }));
    await assert.rejects(() =>
      commitCsv(
        id,
        { token: "00000000-0000-4000-8000-000000000002", choices: cs },
        actor,
        deps,
      ),
    );
    await assert.rejects(() =>
      commitCsv(id, { token: id, choices: cs.slice(1) }, actor, deps),
    );
    await assert.rejects(() =>
      commitCsv(id, { token: id, choices: cs }, actor, {
        ...deps,
        copy: async () => {
          throw new Error("storage unavailable");
        },
      }),
    );
    assert.equal(commitCount, 0);
    await commitCsv(id, { token: id, choices: cs }, actor, deps);
    assert.equal(commitCount, 1);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    let attached: Record<string, unknown> | undefined;
    const pdfDeps = {
      ...attachmentDependencies,
      getStatement: async () => batch,
      head: async () => ({
        $metadata: {},
        VersionId: "pdf-upload-version",
        ContentLength: pdf.length,
        ContentType: "application/pdf",
        Metadata: { sha256: pdfHash, filename: "c2FtcGxlLnBkZg==" },
      }),
      read: async (_b: string, _k: string, v: string) => {
        assert.equal(v, "pdf-upload-version");
        return pdf;
      },
      copy: async () => "pdf-permanent-version",
      saveSpendingRecord: async (
        _t: unknown,
        _id: unknown,
        v: Record<string, unknown>,
      ) => {
        attached = v;
        return id;
      },
    };
    await assert.rejects(() =>
      finishStatementUpload(id, { key: pdfKey }, actor, {
        ...pdfDeps,
        copy: async () => {
          throw new Error("storage unavailable");
        },
      }),
    );
    assert.equal(attached, undefined);
    await finishStatementUpload(id, { key: pdfKey }, actor, pdfDeps);
    assert.equal(attached?.source_file_version, "pdf-permanent-version");
    assert.equal(attached?.source_file_key, pdfKey.replace("/pending/", "/"));
  } finally {
    if (priorBucket === undefined) delete process.env.STATEMENT_BUCKET_NAME;
    else process.env.STATEMENT_BUCKET_NAME = priorBucket;
  }
  console.log(
    "Spending parser: 24 encoding/layout combinations, strict errors, CN/NZ dates, signs, classification, precision, storage failures/version pinning and route roles passed.",
  );
}
void main();
