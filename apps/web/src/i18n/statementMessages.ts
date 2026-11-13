import { SPENDING_CURRENCIES, SPENDING_PREVIEW_ERROR_REASONS, type SpendingPreview } from "@family-ledger/shared";
import { ApiClientError } from "../lib/apiClient";
import { StatementUploadError } from "../lib/spendingClient";
import { i18n } from "./instance";
import type { UiLanguage } from "./language";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "./uiErrors";

export type StatementAction = "read" | "preview" | "commit" | "undo" | "attachment" | "save";
type LocalErrorKey = "csvRequired" | "csvInvalid" | "pdfInvalid" | "uploadFailed"
  | "previewRejected" | "commitRejected" | "undoRejected" | "attachmentRejected";
const reasonKeys = {
  STATEMENT_ENCODING_AMBIGUOUS: "statementEncodingAmbiguous",
  STATEMENT_ENCODING_BOM_MISMATCH: "statementEncodingBomMismatch",
  STATEMENT_BATCH_CLOSED: "statementBatchClosed",
  STATEMENT_PREVIEW_CHANGED: "statementPreviewChanged",
  STATEMENT_PREVIEW_EXPIRED: "statementPreviewExpired",
  STATEMENT_CSV_ERRORS: "statementCsvErrors",
  STATEMENT_DUPLICATE: "statementDuplicate",
  STATEMENT_PDF_INVALID: "statementPdfInvalid",
  STATEMENT_PDF_VERIFY_FAILED: "statementPdfVerifyFailed",
  STATEMENT_ATTACHMENT_CANCELLED: "statementAttachmentCancelled",
  STATEMENT_UPLOAD_VERIFY_FAILED: "statementUploadVerifyFailed",
  STATEMENT_PREVIEW_TOO_LARGE: "statementPreviewTooLarge",
} as const;
type StatementReason = keyof typeof reasonKeys;
export type StatementError =
  | { kind: "local"; key: LocalErrorKey }
  | { kind: "reason"; reason: StatementReason }
  | { kind: "shared"; error: UiErrorDescriptor };

export function describeStatementError(error: unknown, action: StatementAction): StatementError {
  if (error instanceof StatementUploadError) return { kind: "local", key: error.reason };
  if (error instanceof ApiClientError) {
    const details = error.details;
    if (details && "kind" in details && Object.hasOwn(reasonKeys, details.reason)) {
      return { kind: "reason", reason: details.reason as StatementReason };
    }
    if (error.status === 400 || (error.status === 409 && action === "commit")) {
      const validationKey = {
        preview: "previewRejected", commit: "commitRejected",
        undo: "undoRejected", attachment: "attachmentRejected",
      } as const;
      if (action === "preview" || action === "commit" || action === "undo" || action === "attachment") {
        return { kind: "local", key: validationKey[action] };
      }
    }
  }
  const context = action === "read" ? "statementRead"
    : action === "commit" ? "statementCommit"
    : action === "undo" ? "statementDelete"
    : "statementSave";
  return { kind: "shared", error: describeUiError(error, context) };
}

export function translateStatementError(error: StatementError, language: UiLanguage): string {
  if (error.kind === "shared") return translateUiError(error.error, language);
  const t = i18n.getFixedT(language, "spendingImport");
  return error.kind === "reason" ? t(`rejection.${reasonKeys[error.reason]}`) : t(error.key);
}

export function formatStatementRowError(error: SpendingPreview["errors"][number], language: UiLanguage): string {
  const t = i18n.getFixedT(language, "spendingImport");
  const reason = error.detail?.reason;
  const detail = reason && SPENDING_PREVIEW_ERROR_REASONS.includes(reason)
    ? t(`rowIssue.${reason}`)
    : t("legacyRowError");
  return t("recordError", { row: error.row_number, detail });
}

export function formatStatementWarnings(preview: SpendingPreview, language: UiLanguage): string[] {
  const t = i18n.getFixedT(language, "spendingImport");
  const details = new Map(
    Array.isArray(preview.warningDetails)
      ? preview.warningDetails.filter((entry) => entry && Number.isSafeInteger(entry.warningIndex))
        .map((entry) => [entry.warningIndex, entry.detail])
      : [],
  );
  return preview.warnings.map((_, index) => {
    const detail = details.get(index);
    if (detail?.reason === "bnzCurrency" && SPENDING_CURRENCIES.includes(detail.currency)) {
      return t("bnzCurrency", { currency: detail.currency });
    }
    if (detail?.reason === "extraFields" && Number.isSafeInteger(detail.row) && detail.row > 0) {
      return t("extraFields", { row: detail.row });
    }
    return t("legacyWarning");
  });
}
