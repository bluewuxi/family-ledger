import type { AuthenticatedUser, SnapshotDisplayCurrency, UserPreferences } from "@family-ledger/shared";
import { parseReportingCurrency } from "./portfolioValuationService";
import { getProfilePreferences } from "./profileService";

type LoadPreferences = (user: AuthenticatedUser) => Promise<UserPreferences>;

export async function resolveReportingCurrency(
  input: { currency?: string; user?: AuthenticatedUser },
  loadPreferences: LoadPreferences = getProfilePreferences
): Promise<SnapshotDisplayCurrency> {
  if (input.currency !== undefined && input.currency !== "") {
    return parseReportingCurrency(input.currency);
  }

  if (!input.user) {
    return parseReportingCurrency(input.currency);
  }

  const preferences = await loadPreferences(input.user);
  return parseReportingCurrency(preferences.preferredCurrency);
}
