import assert from "node:assert/strict";
import { FrankfurterFxRateProvider } from "../apps/jobs/src/providers/FrankfurterFxRateProvider";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  let requestedUrl = "";
  const provider = new FrankfurterFxRateProvider({
    fetchFn: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            amount: 1,
            base: "USD",
            date: "2026-05-22",
            rates: {
              NZD: 1.632,
              CNY: 7.121,
              HKD: 7.849,
              EUR: 0.923,
              GBP: 0.784
            }
          };
        }
      };
    }
  });

  const result = await provider.fetchLatestRates({
    baseCurrency: "USD",
    targetCurrencies: ["NZD", "CNY", "HKD", "EUR", "GBP"],
    fetchedAt: "2026-05-23T01:00:00.000Z"
  });

  const url = new URL(requestedUrl);
  assert.equal(url.origin + url.pathname, "https://api.frankfurter.app/latest");
  assert.equal(url.searchParams.get("from"), "USD");
  assert.equal(url.searchParams.get("to"), "NZD,CNY,HKD,EUR,GBP");
  assert.equal(result.provider, "Frankfurter");
  assert.equal(result.baseCurrency, "USD");
  assert.equal(result.rateDate, "2026-05-22");
  assert.equal(result.fetchedAt, "2026-05-23T01:00:00.000Z");
  assert.deepEqual(result.rates, [
    { currency: "NZD", providerRate: "1.632" },
    { currency: "CNY", providerRate: "7.121" },
    { currency: "HKD", providerRate: "7.849" },
    { currency: "EUR", providerRate: "0.923" },
    { currency: "GBP", providerRate: "0.784" }
  ]);

  const invalidProvider = new FrankfurterFxRateProvider({
    fetchFn: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          base: "USD",
          date: "2026-05-22",
          rates: {
            NZD: 0
          }
        };
      }
    })
  });

  await assert.rejects(
    invalidProvider.fetchLatestRates({
      baseCurrency: "USD",
      targetCurrencies: ["NZD"],
      fetchedAt: "2026-05-23T01:00:00.000Z"
    }),
    /must be positive/
  );

  console.log("Frankfurter provider verification: success");
}
