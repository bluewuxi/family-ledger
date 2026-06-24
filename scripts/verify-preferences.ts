import assert from "node:assert/strict";
import type { AuthenticatedUser, UserPreferences } from "@family-ledger/shared";
import { resolveReportingCurrency } from "../apps/api/src/services/reportingCurrencyService";
import { signedToneClass } from "../apps/web/src/lib/preferencesContext";

const user: AuthenticatedUser = {
  id: "user-a",
  email: "user@example.com",
  role: "viewer"
};

const cnyPreferences: UserPreferences = {
  preferredCurrency: "CNY",
  gainColorScheme: "red_positive",
  uiTheme: "system"
};

void verifyPreferences()
  .then(() => {
    console.log("Preferences verification: success");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function verifyPreferences(): Promise<void> {
  let loadCount = 0;
  const loadPreferences = async (): Promise<UserPreferences> => {
    loadCount += 1;
    return cnyPreferences;
  };

  const preferredCurrency = await resolveReportingCurrency({ user }, loadPreferences);
  assert.equal(preferredCurrency, "CNY");
  assert.equal(loadCount, 1);

  const explicitCurrency = await resolveReportingCurrency({ currency: "USD", user }, loadPreferences);
  assert.equal(explicitCurrency, "USD");
  assert.equal(loadCount, 1);

  const legacyFallbackCurrency = await resolveReportingCurrency({}, loadPreferences);
  assert.equal(legacyFallbackCurrency, "NZD");

  await assert.rejects(
    () => resolveReportingCurrency({ currency: "JPY", user }, loadPreferences),
    /currency must be NZD, USD, or CNY/
  );

  assert.equal(signedToneClass("0.0004", "red_positive", 3), "metric-neutral");
  assert.equal(signedToneClass("-0.0004", "red_positive", 3), "metric-neutral");
  assert.equal(signedToneClass("0.04", "red_positive", 1), "metric-neutral");
  assert.equal(signedToneClass("0.05", "red_positive", 1), "metric-red");
  assert.equal(signedToneClass("-0.05", "green_positive", 1), "metric-red");
}
