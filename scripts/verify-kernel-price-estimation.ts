import assert from "node:assert/strict";
import {
  MARKET_DATA_SOURCE_DEFINITIONS,
  getKernelValuationDateForNzxSession,
  parseYahooFinanceDailyBars,
  selectPreferredPriceRecord,
  type KernelPriceAnchor,
  type PriceRecord
} from "@family-ledger/shared";
import { KernelEstimatedInstrumentPriceProvider } from "../apps/jobs/src/providers/KernelEstimatedInstrumentPriceProvider";
import {
  calculateKernelEstimates,
  resolveMarketDataSourceStatus
} from "../apps/api/src/services/marketDataSourceService";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  assert.deepEqual(
    MARKET_DATA_SOURCE_DEFINITIONS.map((source) => source.key),
    ["frankfurter", "yahoo_finance", "eastmoney", "fundrock", "kernel_estimate"]
  );
  assert.equal(resolveMarketDataSourceStatus("kernel_estimate", 0, 0), "needs_configuration");
  assert.equal(resolveMarketDataSourceStatus("kernel_estimate", 1, 1), "ready");
  assert.equal(resolveMarketDataSourceStatus("kernel_estimate", 0, 1), "inactive");
  assert.equal(resolveMarketDataSourceStatus("yahoo_finance", 0, 0), "inactive");
  assert.equal(resolveMarketDataSourceStatus("frankfurter", null, 0), "ready");

  const response = yahooResponse([
    ["2026-09-30T21:00:00Z", 10, 10.25],
    ["2026-10-01T21:00:00Z", 11, 11.25]
  ]);
  const beforeClose = parseYahooFinanceDailyBars(response, {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-10-01T23:00:00Z",
    confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 17, minute: 15 }
  });
  assert.deepEqual(beforeClose.bars, [{ priceDate: "2026-10-01", openPrice: "10", closePrice: "10.25" }]);

  const afterClose = parseYahooFinanceDailyBars(response, {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-10-02T05:00:00Z",
    confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 17, minute: 15 }
  });
  assert.equal(afterClose.bars.at(-1)?.priceDate, "2026-10-02");

  const liveResponse = yahooResponse([
    ["2026-09-30T21:00:00Z", 10, 10.25],
    ["2026-10-01T00:00:00Z", null, 10.5],
    ["2026-10-01T21:00:00Z", 11, null]
  ]);
  const confirmedOpens = parseYahooFinanceDailyBars(liveResponse, {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-10-01T21:10:00Z",
    requiredPriceField: "open",
    confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 10, minute: 5 }
  });
  assert.deepEqual(confirmedOpens.bars, [
    { priceDate: "2026-10-01", openPrice: "10", closePrice: "10.5" },
    { priceDate: "2026-10-02", openPrice: "11" }
  ]);
  const beforeOpeningCutoff = parseYahooFinanceDailyBars(liveResponse, {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-10-01T21:04:00Z",
    requiredPriceField: "open",
    confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 10, minute: 5 }
  });
  assert.equal(beforeOpeningCutoff.bars.at(-1)?.priceDate, "2026-10-01");
  const confirmedCloses = parseYahooFinanceDailyBars(liveResponse, {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-10-01T21:10:00Z"
  });
  assert.deepEqual(confirmedCloses.bars, [
    { priceDate: "2026-10-01", openPrice: "10", closePrice: "10.5" }
  ]);

  const winter = parseYahooFinanceDailyBars(yahooResponse([["2026-07-01T22:00:00Z", 9.5, 9.75]]), {
    sourceSymbol: "USF.NZ",
    expectedCurrency: "NZD",
    expectedExchangeTimeZone: "Pacific/Auckland",
    fetchedAt: "2026-07-02T06:00:00Z"
  });
  assert.equal(winter.bars[0]?.priceDate, "2026-07-02");
  assert.equal(getKernelValuationDateForNzxSession("2026-10-01"), "2026-09-30");
  assert.equal(getKernelValuationDateForNzxSession("2026-09-28"), "2026-09-25");

  const anchors = [anchor("a1", "2026-09-30", "5", "10", "2026-10-01", "2026-10-01T00:00:00Z")];
  assert.deepEqual(
    calculateKernelEstimates(
      [
        { priceDate: "2026-09-30", openPrice: "9", closePrice: "9.1" },
        { priceDate: "2026-10-01", openPrice: "10", closePrice: "10.1" },
        { priceDate: "2026-10-02", openPrice: "11", closePrice: "11.1" }
      ],
      anchors,
      "2026-10-02T05:00:00Z"
    ),
    [{ priceDate: "2026-10-01", closePrice: "5.5000000000", fetchedAt: "2026-10-02T05:00:00Z" }]
  );

  const revised = anchor("a2", "2026-09-30", "6", "10", "2026-10-01", "2026-10-02T00:00:00Z");
  assert.equal(
    calculateKernelEstimates(
      [{ priceDate: "2026-10-02", openPrice: "11", closePrice: "99" }],
      [anchors[0]!, revised],
      "now"
    )[0]?.closePrice,
    "6.6000000000"
  );
  assert.equal(
    calculateKernelEstimates(
      [{ priceDate: "2026-10-02", openPrice: "11", closePrice: "99" }],
      [
        anchor("legacy", "2026-09-30", "99", "9", "2026-09-30", "2026-10-03T00:00:00Z"),
        anchors[0]!
      ],
      "now"
    )[0]?.closePrice,
    "5.5000000000"
  );
  assert.equal(
    calculateKernelEstimates(
      [{ priceDate: "2026-10-02", openPrice: "1.00000000005", closePrice: "999" }],
      [anchor("rounding", "2026-09-30", "1", "1", "2026-10-01", "2026-10-01T00:00:00Z")],
      "now"
    )[0]?.closePrice,
    "1.0000000001"
  );
  assert.equal(
    calculateKernelEstimates(
      [{ priceDate: "2026-10-05", openPrice: "15", closePrice: "999" }],
      [anchors[0]!, anchor("later", "2026-10-01", "7", "14", "2026-10-02", "2026-10-02T05:00:00Z")],
      "now"
    )[0]?.closePrice,
    "7.5000000000"
  );

  const exact = priceRecord("exact", false, "Kernel Anchor");
  const estimate = priceRecord("estimate", true, "Kernel Estimate (USF.NZ)");
  assert.equal(selectPreferredPriceRecord([estimate, exact]).id, "exact");

  const provider = new KernelEstimatedInstrumentPriceProvider({
    fetchFn: async () => ({ ok: true, status: 200, async json() { return response; } }),
    listAnchors: async () => anchors
  });
  const providerResult = await provider.fetchLatestPrices({
    fetchedAt: "2026-10-02T05:00:00Z",
    instruments: [{
      instrumentId: "kernel-instrument",
      sourceSymbol: "USF.NZ",
      providerInstrumentName: "Kernel S&P 500 (Unhedged) Fund",
      currency: "NZD",
      sourceExchange: "NZX"
    }]
  });
  assert.deepEqual(providerResult.prices, [{
    sourceSymbol: "USF.NZ",
    priceDate: "2026-10-01",
    closePrice: "5.5000000000",
    currency: "NZD",
    isEstimated: true
  }]);

  const exactDateProvider = new KernelEstimatedInstrumentPriceProvider({
    fetchFn: async () => ({ ok: true, status: 200, async json() { return response; } }),
    listAnchors: async () => [anchor("exact-date", "2026-10-01", "5.5", "11", "2026-10-02", "2026-10-02T05:00:00Z")]
  });
  const exactDateResult = await exactDateProvider.fetchLatestPrices({
    fetchedAt: "2026-10-02T05:00:00Z",
    instruments: [{
      instrumentId: "kernel-instrument",
      sourceSymbol: "USF.NZ",
      providerInstrumentName: "Kernel S&P 500 (Unhedged) Fund",
      currency: "NZD",
      sourceExchange: "NZX"
    }]
  });
  assert.deepEqual(exactDateResult.prices, []);
  assert.deepEqual(exactDateResult.skippedSourceSymbols, ["USF.NZ"]);

  await assert.rejects(
    new KernelEstimatedInstrumentPriceProvider({
      fetchFn: async () => ({ ok: true, status: 200, async json() { return response; } }),
      listAnchors: async () => []
    }).fetchLatestPrices({
      fetchedAt: "2026-10-02T05:00:00Z",
      instruments: [{
        instrumentId: "kernel-instrument",
        sourceSymbol: "USF.NZ",
        providerInstrumentName: "Kernel S&P 500 (Unhedged) Fund",
        currency: "NZD",
        sourceExchange: "NZX"
      }]
    }),
    /no applicable price anchor/
  );
  await assert.rejects(
    provider.fetchLatestPrices({
      fetchedAt: "2026-10-02T05:00:00Z",
      instruments: [{
        instrumentId: "kernel-instrument",
        sourceSymbol: "USF.NZ",
        providerInstrumentName: "Kernel S&P 500 (Unhedged) Fund",
        currency: "NZD",
        sourceExchange: "NASDAQ"
      }]
    }),
    /invalid proxy configuration/
  );
  await assert.rejects(
    new KernelEstimatedInstrumentPriceProvider({
      fetchFn: async () => ({ ok: false, status: 503, async json() { return {}; } }),
      listAnchors: async () => anchors
    }).fetchLatestPrices({
      fetchedAt: "2026-10-02T05:00:00Z",
      instruments: [{
        instrumentId: "kernel-instrument",
        sourceSymbol: "USF.NZ",
        providerInstrumentName: "Kernel S&P 500 (Unhedged) Fund",
        currency: "NZD",
        sourceExchange: "NZX"
      }]
    }),
    /status 503/
  );

  console.log("Kernel price estimation verification: success");
}

function anchor(
  id: string,
  anchorDate: string,
  kernelUnitPrice: string,
  proxyClose: string,
  proxyPriceDate: string,
  createdAt: string
): KernelPriceAnchor {
  return {
    id,
    instrumentId: "kernel-instrument",
    anchorDate,
    kernelUnitPrice,
    proxySymbol: "USF.NZ",
    proxyCurrency: "NZD",
    proxyClose,
    proxyPriceDate,
    proxyFetchedAt: createdAt,
    createdByUserId: "user-id",
    createdAt
  };
}

function priceRecord(id: string, isEstimated: boolean, source: string): PriceRecord {
  return {
    id,
    instrumentId: "kernel-instrument",
    priceDate: "2026-10-01",
    closePrice: "5",
    currency: "NZD",
    source,
    sourceSymbol: "USF.NZ",
    isAdjusted: false,
    isEstimated,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z"
  };
}

function yahooResponse(rows: Array<[string, number | null, number | null]>): unknown {
  return {
    chart: {
      result: [{
        meta: { symbol: "USF.NZ", currency: "NZD", exchangeTimezoneName: "Pacific/Auckland" },
        timestamp: rows.map(([timestamp]) => Date.parse(timestamp) / 1000),
        indicators: {
          quote: [{
            open: rows.map(([, open]) => open),
            close: rows.map(([, , close]) => close)
          }],
          adjclose: [{ adjclose: rows.map(() => 999) }]
        }
      }],
      error: null
    }
  };
}
