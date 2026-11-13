import { parseInvestmentErrorDetails, type InvestmentErrorDetails } from "./investmentErrorDetails";

const workflowReasons = [
  "ADMIN_PASSWORD_REJECTED", "TEMPORARY_PASSWORD_REUSED", "TEMPORARY_PASSWORD_LENGTH",
  "STATEMENT_ENCODING_AMBIGUOUS", "STATEMENT_ENCODING_BOM_MISMATCH",
  "STATEMENT_BATCH_CLOSED", "STATEMENT_PREVIEW_CHANGED", "STATEMENT_PREVIEW_EXPIRED",
  "STATEMENT_CSV_ERRORS", "STATEMENT_DUPLICATE", "STATEMENT_PDF_INVALID",
  "STATEMENT_PDF_VERIFY_FAILED", "STATEMENT_ATTACHMENT_CANCELLED",
  "STATEMENT_UPLOAD_VERIFY_FAILED", "STATEMENT_PREVIEW_TOO_LARGE"
] as const;

export type WorkflowErrorReason = typeof workflowReasons[number];
export interface WorkflowErrorDetails {
  kind: "workflow";
  reason: WorkflowErrorReason;
}
export type ApiErrorDetails = InvestmentErrorDetails | WorkflowErrorDetails;

export function parseWorkflowErrorDetails(value: unknown): WorkflowErrorDetails | undefined {
  if (!value || typeof value !== "object" || !("kind" in value) || value.kind !== "workflow" || !("reason" in value)) return undefined;
  const reason = workflowReasons.find(candidate => candidate === value.reason);
  return reason ? { kind: "workflow", reason } : undefined;
}

export function parseApiErrorDetails(value: unknown): ApiErrorDetails | undefined {
  return value && typeof value === "object" && "kind" in value
    ? parseWorkflowErrorDetails(value) : parseInvestmentErrorDetails(value);
}
