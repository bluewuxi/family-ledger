import type { AuthenticatedUser, CurrencyCode, UpdateUserPreferencesInput, UserPreferences } from "@family-ledger/shared";
import { SNAPSHOT_DISPLAY_CURRENCIES } from "@family-ledger/shared";
import {
  getOrCreateProfile,
  updateProfilePreferences as updateProfilePreferencesRecord
} from "../repositories/profileRepository";
import { ApiRequestError } from "../utils/apiError";

export async function getProfilePreferences(user: AuthenticatedUser): Promise<UserPreferences> {
  const profile = await getOrCreateProfile(user);
  return {
    preferredCurrency: profile.preferredCurrency,
    uiTheme: "system"
  };
}

export async function updateProfilePreferences(body: unknown, user: AuthenticatedUser): Promise<UserPreferences> {
  const input = parseUpdatePreferencesInput(body);

  if (!input.preferredCurrency) {
    return getProfilePreferences(user);
  }

  const profile = await updateProfilePreferencesRecord(user, { preferredCurrency: input.preferredCurrency });
  return {
    preferredCurrency: profile.preferredCurrency,
    uiTheme: "system"
  };
}

function parseUpdatePreferencesInput(body: unknown): UpdateUserPreferencesInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be an object.", 400);
  }

  const input: UpdateUserPreferencesInput = {};
  const record = body as { preferredCurrency?: unknown };

  if ("preferredCurrency" in record) {
    input.preferredCurrency = requiredReportCurrency(record.preferredCurrency);
  }

  return input;
}

function requiredReportCurrency(value: unknown): CurrencyCode {
  if (!SNAPSHOT_DISPLAY_CURRENCIES.includes(value as (typeof SNAPSHOT_DISPLAY_CURRENCIES)[number])) {
    throw new ApiRequestError("VALIDATION_ERROR", "preferredCurrency must be NZD, USD, or CNY.", 400);
  }

  return value as CurrencyCode;
}
