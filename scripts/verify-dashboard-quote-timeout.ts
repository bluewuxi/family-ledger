import assert from "node:assert/strict";
import { EastMoneyInstrumentQuoteProvider } from "../apps/api/src/providers/EastMoneyInstrumentQuoteProvider";
import { YahooFinanceInstrumentQuoteProvider } from "../apps/api/src/providers/YahooFinanceInstrumentQuoteProvider";

async function stalledFetch(_url: string, options?: { signal: AbortSignal }): Promise<never> {
  assert.ok(options?.signal, "Live quote fetch must have an abort signal");
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
}
async function main() {
  const deadline = setTimeout(() => { console.error("Quote timeout did not terminate requests"); process.exit(1); }, 9000);
  try {
    await Promise.all([
      assert.rejects(new EastMoneyInstrumentQuoteProvider({ fetchFn: stalledFetch }).fetchLatestQuotes({
        fetchedAt: "2026-09-22T00:00:00Z", instruments: [{ instrumentId: "fixture", sourceSymbol: "510300", sourceExchange: "SSE", currency: "CNY" }]
      }), { name: "TimeoutError" }),
      assert.rejects(new YahooFinanceInstrumentQuoteProvider({ fetchFn: stalledFetch }).fetchLatestQuotes({
        fetchedAt: "2026-09-22T00:00:00Z", instruments: [{ instrumentId: "fixture", sourceSymbol: "VGT", sourceExchange: "NYSE_ARCA", currency: "USD" }]
      }), { name: "TimeoutError" })
    ]);
    console.log("Stalled quote requests abort within the provider deadline: passed");
  } finally { clearTimeout(deadline); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
