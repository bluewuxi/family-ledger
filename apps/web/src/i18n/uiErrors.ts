import { InvestmentGroupInputError, type InvestmentErrorDetails } from "@family-ledger/shared";
import { AuthClientError } from "../lib/authClient";
import { ApiClientError } from "../lib/apiClient";
import errors from "./resources/en/errors";
import { i18n } from "./instance";
import type { UiLanguage } from "./language";

export type UiErrorDescriptor = { key: "investment"; details: InvestmentErrorDetails } | { [K in keyof typeof errors]: { key: K; params?: never } }[keyof typeof errors];
export type UiErrorContext = "login" | "session" | "changePassword" | "groupLoad" | "groupSave" | "groupDelete" | "investmentRead" | "accountSave" | "accountDelete" | "instrumentSave" | "instrumentDelete" | "transactionSave" | "transactionDelete" | "monthlyReviewSave" | "tradingPasswordReveal" | "tradingPasswordUpdate";
export function describeUiError(error: unknown, context: UiErrorContext): UiErrorDescriptor {
  if (error instanceof InvestmentGroupInputError) {
    const reasons = { invalid_request: "invalidRequest", invalid_revision: "invalidRevision", invalid_name: "invalidName", invalid_members: "invalidMembers", duplicate_members: "duplicateMembers" } as const;
    return { key: reasons[error.reason] };
  }
  const mutation = /Save$|Delete$|Update$/.test(context);
  if (error instanceof ApiClientError && error.details) return { key: "investment", details: error.details };
  if (error instanceof AuthClientError || error instanceof ApiClientError) {
    const { code, status } = error;
    if (code === "PASSWORD_CHANGE_REQUIRED") return { key: "passwordRequired" };
    if (code === "MISSING_API_BASE_URL") return { key: "missingConfig" };
    if (code === "STALE_SESSION") return { key: "staleSession" };
    if (code === "STALE_SCOPE") return { key: "staleScope" };
    if (code === "SCOPE_CHANGED") return { key: "scopeChanged" };
    if (code === "MISSING_SESSION" || status === 401) return { key: context === "login" ? "invalidCredentials" : context === "changePassword" ? "currentPasswordRejected" : "sessionExpired" };
    if (code === "FORBIDDEN" || status === 403) return { key: "forbidden" };
    if (status === 429) return { key: "rateLimit" };
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
  return { key: mutation ? "uncertainWrite" : context === "changePassword" ? "changeUnknown" : "unknownRead" };
}
export function translateUiError(error: UiErrorDescriptor, language: UiLanguage): string {
  if (error.key === "investment") return translateInvestmentError(error.details, language);
  return i18n.getFixedT(language, "errors")(error.key);
}

import { translateInvestmentError } from "./investmentMessages";
