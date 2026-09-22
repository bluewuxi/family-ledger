import type { AccountPurposeOverview, AuthenticatedUser, CurrencyCode } from "@family-ledger/shared";
import { apiGet } from "./apiClient";

export function loadAccountPurposeOverview(input: {
  purpose: "daily_expense" | "education";
  currency: CurrencyCode;
  accountId: string;
  from: string;
  to: string;
}): Promise<{ user: AuthenticatedUser; overview: AccountPurposeOverview }> {
  const query = new URLSearchParams({ purpose: input.purpose, currency: input.currency });
  for (const field of ["accountId", "from", "to"] as const) {
    if (input[field]) query.set(field, input[field]);
  }
  return apiGet(`/account-purpose-overview?${query}`);
}
