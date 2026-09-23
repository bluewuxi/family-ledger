import assert from "node:assert/strict";
import { mock } from "node:test";
import { EastMoneyInstrumentQuoteProvider } from "../apps/api/src/providers/EastMoneyInstrumentQuoteProvider";
import { YahooFinanceInstrumentQuoteProvider } from "../apps/api/src/providers/YahooFinanceInstrumentQuoteProvider";
import type { InstrumentQuoteProviderInstrument } from "../apps/api/src/providers/IInstrumentQuoteProvider";

type FetchFn = NonNullable<ConstructorParameters<typeof YahooFinanceInstrumentQuoteProvider>[0]>["fetchFn"];
const cases = [
  {
    create: (fetchFn: FetchFn) => new YahooFinanceInstrumentQuoteProvider({ fetchFn }),
    instrument: { instrumentId: "fixture", sourceSymbol: "VGT", currency: "USD" } satisfies InstrumentQuoteProviderInstrument,
    body: { chart: { result: [{ meta: { symbol: "VGT", currency: "USD", regularMarketTime: 1790035200, regularMarketPrice: 100 } }] } }
  },
  {
    create: (fetchFn: FetchFn) => new EastMoneyInstrumentQuoteProvider({ fetchFn }),
    instrument: { instrumentId: "fixture", sourceSymbol: "510300", sourceExchange: "SSE", currency: "CNY" } satisfies InstrumentQuoteProviderInstrument,
    body: { data: { f57: "510300", f43: 100, f86: 1790035200 } }
  }
];

async function verifyPartialResults() {
  for (const fixture of cases) {
    for (const phase of ["fetch", "body", "between"] as const) {
      const controller = new AbortController();
      const timeout = mock.method(AbortSignal, "timeout", (milliseconds: number) => {
        assert.equal(milliseconds, 6000);
        return controller.signal;
      });
      let calls = 0;
      try {
        const provider = fixture.create(async () => {
          calls++;
          const expire = () => {
            controller.abort(new DOMException("Fixture deadline", "TimeoutError"));
            throw controller.signal.reason;
          };
          if (calls === 2 && phase === "fetch") expire();
          return { ok: true, status: 200, json: async () => {
            if (calls === 2 && phase === "body") expire();
            if (phase === "between") controller.abort();
            return fixture.body;
          } };
        });
        const result = await provider.fetchLatestQuotes({
          fetchedAt: "2026-09-22T00:00:00Z",
          instruments: [1, 2, 3].map((id) => ({ ...fixture.instrument, instrumentId: String(id) }))
        });
        assert.deepEqual(result.quotes.map((quote) => quote.instrumentId), ["1"]);
        assert.equal(result.quotes[0]?.quotePrice, "100");
        assert.equal(calls, phase === "between" ? 1 : 2, "Do not start requests after the deadline");
      } finally { timeout.mock.restore(); }
    }
    const input = { fetchedAt: "2026-09-22T00:00:00Z", instruments: [fixture.instrument] };
    await assert.rejects(fixture.create(async () => ({ ok: false, status: 503, json: async () => ({}) }))
      .fetchLatestQuotes(input), /status 503/);
    await assert.rejects(fixture.create(async () => ({ ok: true, status: 200, json: async () => ({}) }))
      .fetchLatestQuotes(input));
  }
}

async function stalledFetch(_url: string, options?: { signal: AbortSignal }): Promise<never> {
  assert.ok(options?.signal, "Live quote fetch must have an abort signal");
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
}
async function main() {
  await verifyPartialResults();
  const deadline = setTimeout(() => { console.error("Quote timeout did not terminate requests"); process.exit(1); }, 9000);
  try {
    await Promise.all([
      new EastMoneyInstrumentQuoteProvider({ fetchFn: stalledFetch }).fetchLatestQuotes({
        fetchedAt: "2026-09-22T00:00:00Z", instruments: [{ instrumentId: "fixture", sourceSymbol: "510300", sourceExchange: "SSE", currency: "CNY" }]
      }).then((result) => assert.deepEqual(result.quotes, [])),
      new YahooFinanceInstrumentQuoteProvider({ fetchFn: stalledFetch }).fetchLatestQuotes({
        fetchedAt: "2026-09-22T00:00:00Z", instruments: [{ instrumentId: "fixture", sourceSymbol: "VGT", sourceExchange: "NYSE_ARCA", currency: "USD" }]
      }).then((result) => assert.deepEqual(result.quotes, []))
    ]);
    console.log("Quote deadline, partial results, body cancellation and non-timeout errors: passed");
  } finally { clearTimeout(deadline); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
