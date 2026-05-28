import type {
  AuthenticatedUser,
  CurrencyCode,
  GainColorScheme,
  UpdateUserPreferencesInput,
  UiTheme,
  UserPreferences
} from "@family-ledger/shared";
import { GAIN_COLOR_SCHEMES, SNAPSHOT_DISPLAY_CURRENCIES, UI_THEMES } from "@family-ledger/shared";
import {
  getOrCreateProfile,
  updateProfilePreferences as updateProfilePreferencesRecord
} from "../repositories/profileRepository";
import { ApiRequestError } from "../utils/apiError";

export async function getProfilePreferences(user: AuthenticatedUser): Promise<UserPreferences> {
  const profile = await getOrCreateProfile(user);
  return {
    preferredCurrency: profile.preferredCurrency,
    gainColorScheme: profile.gainColorScheme,
    uiTheme: profile.uiTheme
  };
}

export async function updateProfilePreferences(body: unknown, user: AuthenticatedUser): Promise<UserPreferences> {
  const input = parseUpdatePreferencesInput(body);

  if (!input.preferredCurrency && !input.gainColorScheme && !input.uiTheme) {
    return getProfilePreferences(user);
  }

  const profile = await updateProfilePreferencesRecord(user, input);
  return {
    preferredCurrency: profile.preferredCurrency,
    gainColorScheme: profile.gainColorScheme,
    uiTheme: profile.uiTheme
  };
}

function parseUpdatePreferencesInput(body: unknown): UpdateUserPreferencesInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be an object.", 400);
  }

  const input: UpdateUserPreferencesInput = {};
  const record = body as { preferredCurrency?: unknown; gainColorScheme?: unknown; uiTheme?: unknown };

  if ("preferredCurrency" in record) {
    input.preferredCurrency = requiredReportCurrency(record.preferredCurrency);
  }

  if ("gainColorScheme" in record) {
    input.gainColorScheme = requiredGainColorScheme(record.gainColorScheme);
  }

  if ("uiTheme" in record) {
    input.uiTheme = requiredUiTheme(record.uiTheme);
  }

  return input;
}

function requiredReportCurrency(value: unknown): CurrencyCode {
  if (!SNAPSHOT_DISPLAY_CURRENCIES.includes(value as (typeof SNAPSHOT_DISPLAY_CURRENCIES)[number])) {
    throw new ApiRequestError("VALIDATION_ERROR", "preferredCurrency must be NZD, USD, or CNY.", 400);
  }

  return value as CurrencyCode;
}

function requiredGainColorScheme(value: unknown): GainColorScheme {
  if (!GAIN_COLOR_SCHEMES.includes(value as GainColorScheme)) {
    throw new ApiRequestError("VALIDATION_ERROR", "gainColorScheme must be red_positive or green_positive.", 400);
  }

  return value as GainColorScheme;
}

function requiredUiTheme(value: unknown): UiTheme {
  if (!UI_THEMES.includes(value as UiTheme)) {
    throw new ApiRequestError("VALIDATION_ERROR", "uiTheme must be light or dark.", 400);
  }

  return value as UiTheme;
}
