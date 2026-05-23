import assert from "node:assert/strict";
import { EastMoneyInstrumentPriceProvider } from "../apps/jobs/src/providers/EastMoneyInstrumentPriceProvider";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const requestedUrls: string[] = [];
  const provider = new EastMoneyInstrumentPriceProvider({
    fetchFn: async (url) => {
      requestedUrls.push(url);
      const secid = new URL(url).searchParams.get("secid") ?? "";
      const symbol = secid.split(".")[1] ?? "";
      return {
        ok: true,
        status: 200,
        async json() {
          return eastMoneyResponse(symbol, 1_779_408_000, 1.234);
        }
      };
    }
  });

  const result = await provider.fetchLatestPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    instruments: [
      { sourceSymbol: "161128", providerInstrumentName: "E Fund S&P IT", currency: "CNY", sourceExchange: "SZSE" },
      { sourceSymbol: "513500", providerInstrumentName: "Bosera S&P 500 ETF", currency: "CNY", sourceExchange: "SSE" }
    ]
  });

  assert.equal(result.provider, "Eastmoney");
  assert.deepEqual(
    requestedUrls.map((url) => new URL(url).searchParams.get("secid")),
    ["0.161128", "1.513500"]
  );
  assert.deepEqual(result.prices, [
    { sourceSymbol: "161128", priceDate: "2026-05-22", closePrice: "1.234", currency: "CNY" },
    { sourceSymbol: "513500", priceDate: "2026-05-22", closePrice: "1.234", currency: "CNY" }
  ]);

  await assert.rejects(providerWithResponse(eastMoneyResponse("161128", 1_779_408_000, "-")), /is missing/);
  await assert.rejects(providerWithResponse(eastMoneyResponse("161128", 1_779_408_000, 0)), /must be positive/);
  await assert.rejects(providerWithResponse(eastMoneyResponse("161128", "bad", 1.234)), /timestamp is invalid/);
  await assert.rejects(providerWithResponse(eastMoneyResponse("159501", 1_779_408_000, 1.234)), /returned 159501/);
  await assert.rejects(providerWithResponse({ data: null }), /missing data/);
  await assert.rejects(
    new EastMoneyInstrumentPriceProvider({
      fetchFn: async () => ({ ok: false, status: 503, async json() { return {}; } })
    }).fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [{ sourceSymbol: "161128", providerInstrumentName: "E Fund S&P IT", currency: "CNY", sourceExchange: "SZSE" }]
    }),
    /status 503/
  );
  await assert.rejects(
    new EastMoneyInstrumentPriceProvider().fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [{ sourceSymbol: "AMD", providerInstrumentName: "Unsupported", currency: "USD", sourceExchange: "NASDAQ" }]
    }),
    /unsupported currency/
  );
  await assert.rejects(
    new EastMoneyInstrumentPriceProvider().fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [{ sourceSymbol: "161128", providerInstrumentName: "E Fund S&P IT", currency: "CNY", sourceExchange: "NASDAQ" }]
    }),
    /unsupported exchange/
  );

  console.log("Eastmoney provider verification: success");
}

async function providerWithResponse(response: unknown): Promise<void> {
  const provider = new EastMoneyInstrumentPriceProvider({
    fetchFn: async () => ({ ok: true, status: 200, async json() { return response; } })
  });

  await provider.fetchLatestPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    instruments: [{ sourceSymbol: "161128", providerInstrumentName: "E Fund S&P IT", currency: "CNY", sourceExchange: "SZSE" }]
  });
}

function eastMoneyResponse(symbol: string, timestamp: unknown, price: unknown): unknown {
  return {
    data: {
      f43: price,
      f57: symbol,
      f58: "mock instrument",
      f86: timestamp
    }
  };
}
