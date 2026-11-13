import { InvestmentGroupInputError, type InvestmentErrorDetails } from "@family-ledger/shared";
import { AuthClientError } from "../lib/authClient";
import { ApiClientError } from "../lib/apiClient";
import errors from "./resources/en/errors";
import { i18n } from "./instance";
import type { UiLanguage } from "./language";
import { translateInvestmentError } from "./investmentMessages";

export type UiErrorDescriptor = { key: "investment"; details: InvestmentErrorDetails } | { [K in keyof typeof errors]: { key: K; params?: never } }[keyof typeof errors];
type WorkflowContext = "cashflowRead" | "spendingRead" | "spendingSave" | "spendingDelete" | "educationRead" | "educationSave" | "educationDelete"
  | "statementRead" | "statementSave" | "statementDelete" | "statementCommit"
  | "settingsRead" | "settingsSave" | "accessRead" | "accessSave" | "gateRead" | "gateSave" | "passwordReset"
  | "maintenanceRead" | "maintenanceSave" | "maintenanceQuery" | "maintenanceRetrieve";
export type UiErrorContext = WorkflowContext | "login" | "session" | "changePassword" | "groupLoad" | "groupSave" | "groupDelete" | "investmentRead" | "accountSave" | "accountDelete" | "instrumentSave" | "instrumentDelete" | "transactionSave" | "transactionDelete" | "monthlyReviewSave" | "tradingPasswordReveal" | "tradingPasswordUpdate";

const workflowFallbacks = {
  cashflowRead: "cashflowInvalid", spendingRead: "cashflowInvalid", spendingSave: "spendingInvalid", spendingDelete: "spendingInvalid",
  educationRead: "cashflowInvalid", educationSave: "educationInvalid", educationDelete: "educationInvalid",
  statementRead: "statementInvalid", statementSave: "statementInvalid", statementDelete: "statementInvalid", statementCommit: "statementCommitInvalid",
  settingsRead: "settingsInvalid", settingsSave: "settingsInvalid", accessRead: "accessInvalid", accessSave: "accessInvalid",
  gateRead: "settingsInvalid", gateSave: "gateInvalid", passwordReset: "resetInvalid",
  maintenanceRead: "maintenanceInvalid", maintenanceSave: "maintenanceInvalid", maintenanceQuery: "maintenanceInvalid", maintenanceRetrieve: "maintenanceInvalid"
} as const satisfies Record<WorkflowContext, keyof typeof errors>;

function isWorkflowContext(context: UiErrorContext): context is WorkflowContext {
  return Object.hasOwn(workflowFallbacks, context);
}

export function describeUiError(error: unknown, context: UiErrorContext): UiErrorDescriptor {
  if (error instanceof InvestmentGroupInputError) {
    const reasons = { invalid_request: "invalidRequest", invalid_revision: "invalidRevision", invalid_name: "invalidName", invalid_members: "invalidMembers", duplicate_members: "duplicateMembers" } as const;
    return { key: reasons[error.reason] };
  }
  const mutation = /Save$|Delete$|Update$/.test(context) || ["statementCommit", "passwordReset", "maintenanceQuery", "maintenanceRetrieve"].includes(context);
  const unknown = context === "passwordReset" ? "resetUnknown" : context === "statementCommit" ? "statementCommitUnknown"
    : mutation ? "uncertainWrite" : context === "changePassword" ? "changeUnknown" : "unknownRead";
  if (error instanceof AuthClientError || error instanceof ApiClientError) {
    const { code, status } = error;
    if (error.details && "kind" in error.details) {
      const { reason } = error.details;
      if (context === "passwordReset" && reason === "ADMIN_PASSWORD_REJECTED") return { key: "adminPasswordRejected" };
      if (context === "passwordReset" && reason === "TEMPORARY_PASSWORD_REUSED") return { key: "temporaryPasswordReused" };
      if (context === "passwordReset" && reason === "TEMPORARY_PASSWORD_LENGTH") return { key: "passwordLength" };
    } else if (error instanceof ApiClientError && error.details && (!isWorkflowContext(context) || context === "gateSave")) {
      return { key: "investment", details: error.details };
    }
    if (code === "PASSWORD_CHANGE_REQUIRED") return { key: "passwordRequired" };
    if (code === "MISSING_API_BASE_URL") return { key: "missingConfig" };
    if (code === "STALE_SESSION") return { key: "staleSession" };
    if (code === "STALE_SCOPE") return { key: "staleScope" };
    if (code === "SCOPE_CHANGED") return { key: "scopeChanged" };
    if (code === "MISSING_SESSION" || status === 401) return { key: context === "login" ? "invalidCredentials" : context === "changePassword" ? "currentPasswordRejected" : "sessionExpired" };
    if (code === "FORBIDDEN" || status === 403) return { key: "forbidden" };
    if (status === 429) return { key: "rateLimit" };
    if (isWorkflowContext(context)) {
      if (status === 404) return { key: context === "educationRead" ? "educationNotFound" : "workflowNotFound" };
      if (status === 409) return { key: context === "accessSave" ? "accessConflict" : context === "statementCommit" ? "statementConflict" : context === "passwordReset" ? "resetConflict" : "workflowConflict" };
      if (status === 400 || status === 413 || status === 422) return { key: workflowFallbacks[context] };
      if (status === 503 && !mutation) return { key: "unavailable" };
      return { key: unknown };
    }
    if (context.startsWith("group")) {
      if (code === "CONFLICT" || status === 409) return { key: "groupConflict" };
      if (code === "NOT_FOUND" || status === 404) return { key: "groupNotFound" };
      if (code === "VALIDATION_ERROR" || status === 400) return { key: "groupInvalid" };
    }
    if (context === "investmentRead" && status === 404) return { key: "investmentNotFound" };
    if (!context.startsWith("group") && status === 400) return { key: "investmentInvalid" };
    if (!context.startsWith("group") && status === 409) return { key: "investmentConflict" };
    if (code === "DEPENDENCY_UNAVAILABLE" || status === 503) return { key: mutation ? "uncertainWrite" : context === "changePassword" ? "changeUnknown" : "unavailable" };
  }
  return { key: unknown };
}
export function translateUiError(error: UiErrorDescriptor, language: UiLanguage): string {
  if (error.key === "investment") return translateInvestmentError(error.details, language);
  return i18n.getFixedT(language, "errors")(error.key);
}
