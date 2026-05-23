import assert from "node:assert/strict";
import { YahooFinanceInstrumentPriceProvider } from "../apps/jobs/src/providers/YahooFinanceInstrumentPriceProvider";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const requestedUrls: string[] = [];
  const provider = new YahooFinanceInstrumentPriceProvider({
    fetchFn: async (url) => {
      requestedUrls.push(url);
      const symbol = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
      return {
        ok: true,
        status: 200,
        async json() {
          return yahooChartResponse(symbol, symbol.endsWith(".HK") ? "HKD" : "USD", 1_779_408_000, 123.45);
        }
      };
    }
  });

  const result = await provider.fetchLatestPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    instruments: [
      { sourceSymbol: "AMD", providerInstrumentName: "Advanced Micro Devices, Inc.", currency: "USD" },
      { sourceSymbol: "1810.HK", providerInstrumentName: "Xiaomi Corporation", currency: "HKD" }
    ]
  });

  assert.equal(result.provider, "Yahoo Finance");
  assert.equal(result.fetchedAt, "2026-05-23T01:00:00.000Z");
  assert.equal(requestedUrls.length, 2);
  assert.deepEqual(result.prices, [
    { sourceSymbol: "AMD", priceDate: "2026-05-22", closePrice: "123.45", currency: "USD" },
    { sourceSymbol: "1810.HK", priceDate: "2026-05-22", closePrice: "123.45", currency: "HKD" }
  ]);

  await assert.rejects(providerWithResponse(yahooChartResponse("AMD", "CNY", 1_779_408_000, 123.45)), /expected USD/);
  await assert.rejects(providerWithResponse(yahooChartResponse("AMD", "USD", 1_779_408_000, null, null)), /missing close price/);
  await assert.rejects(providerWithResponse(yahooChartResponse("AMD", "USD", 1_779_408_000, 0)), /must be positive/);
  await assert.rejects(providerWithResponse(yahooChartResponse("AMD", "USD", "bad", 123.45)), /timestamp is invalid/);
  await assert.rejects(providerWithResponse(yahooChartResponse("QQQM", "USD", 1_779_408_000, 123.45)), /returned QQQM/);
  await assert.rejects(
    new YahooFinanceInstrumentPriceProvider({
      fetchFn: async () => ({ ok: false, status: 503, async json() { return {}; } })
    }).fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [{ sourceSymbol: "AMD", providerInstrumentName: "Advanced Micro Devices, Inc.", currency: "USD" }]
    }),
    /status 503/
  );
  await assert.rejects(
    new YahooFinanceInstrumentPriceProvider().fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [{ sourceSymbol: "161128", providerInstrumentName: "Unsupported", currency: "CNY" }]
    }),
    /unsupported currency/
  );

  console.log("Yahoo Finance provider verification: success");
}

async function providerWithResponse(response: unknown): Promise<void> {
  const provider = new YahooFinanceInstrumentPriceProvider({
    fetchFn: async () => ({ ok: true, status: 200, async json() { return response; } })
  });

  await provider.fetchLatestPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    instruments: [{ sourceSymbol: "AMD", providerInstrumentName: "Advanced Micro Devices, Inc.", currency: "USD" }]
  });
}

function yahooChartResponse(
  symbol: string,
  currency: string,
  timestamp: unknown,
  close: unknown,
  previousClose: unknown = 120.01
): unknown {
  return {
    chart: {
      result: [
        {
          meta: { symbol, currency },
          timestamp: [1_779_321_600, timestamp],
          indicators: {
            quote: [
              {
                close: [previousClose, close]
              }
            ]
          }
        }
      ],
      error: null
    }
  };
}
