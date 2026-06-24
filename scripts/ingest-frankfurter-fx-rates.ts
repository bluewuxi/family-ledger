import { config } from "dotenv";
import type { CurrencyCode } from "@family-ledger/shared";
import { DEFAULT_FRANKFURTER_TARGET_CURRENCIES, ingestLatestFrankfurterFxRates } from "../apps/jobs/src/services/fxRateIngestionService";

config({ path: ".env.test", override: false });

const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["NZD", "USD", "HKD", "CNY", "GBP", "EUR"]);

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Frankfurter FX ingestion failed.");
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const targetCurrencies = parseTargetCurrencies(process.env.FRANKFURTER_TARGET_CURRENCIES);
  const result = await ingestLatestFrankfurterFxRates({ targetCurrencies });

  console.log("Frankfurter FX ingestion completed");
  console.log(`Provider: ${result.provider}`);
  console.log(`Rate date: ${result.rateDate}`);
  console.log(`Fetched at: ${result.fetchedAt}`);
  console.log(`Target currencies: ${targetCurrencies.join(", ")}`);
  console.log(`Records inserted: ${result.recordsInserted}`);
  console.log(`Records skipped: ${result.recordsSkipped}`);
}

function parseTargetCurrencies(value: string | undefined): CurrencyCode[] {
  if (!value) {
    return DEFAULT_FRANKFURTER_TARGET_CURRENCIES;
  }

  const currencies = value
    .split(",")
    .map((currency) => currency.trim().toUpperCase())
    .filter((currency) => currency.length > 0);

  if (currencies.length === 0) {
    throw new Error("FRANKFURTER_TARGET_CURRENCIES must include at least one currency.");
  }

  for (const currency of currencies) {
    if (!SUPPORTED_CURRENCIES.has(currency as CurrencyCode)) {
      throw new Error(`Unsupported FRANKFURTER_TARGET_CURRENCIES value: ${currency}.`);
    }
  }

  return [...new Set(currencies)] as CurrencyCode[];
}
