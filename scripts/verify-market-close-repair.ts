import assert from "node:assert/strict";
import type {
  ExchangeRateRecord,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction,
  InstrumentPriceRecord
} from "@family-ledger/shared";
import { applyMarketCloseRepair, createMarketCloseRepairPlan } from "./repair-market-close-history";

void main();

async function main(): Promise<void> {
  const data = fixtureData();
  const plan = createMarketCloseRepairPlan(data);

  assert.deepEqual(plan.suspectPrices.map((price) => price.id), ["cn-live"]);
  assert.deepEqual(plan.affectedSnapshotDates, ["2026-05-29", "2026-05-30", "2026-05-31"]);

  const deletedIds: string[][] = [];
  const recalculatedDates: string[] = [];
  const callOrder: string[] = [];
  const result = await applyMarketCloseRepair({
    plan,
    data,
    deleteInstrumentPricesByIds: async (ids) => {
      callOrder.push("delete");
      deletedIds.push(ids);
    },
    upsertSnapshot: async (valuation) => {
      callOrder.push(`snapshot:${valuation.snapshotDate}`);
      recalculatedDates.push(valuation.snapshotDate);
    }
  });

  assert.deepEqual(deletedIds, [["cn-live"]]);
  assert.deepEqual(recalculatedDates, ["2026-05-29", "2026-05-30", "2026-05-31"]);
  assert.deepEqual(callOrder, ["delete", "snapshot:2026-05-29", "snapshot:2026-05-30", "snapshot:2026-05-31"]);
  assert.deepEqual(result, { deletedPrices: 1, recalculatedSnapshots: 3 });

  const cleanPlan = createMarketCloseRepairPlan({
    ...data,
    prices: data.prices.filter((price) => price.id !== "cn-live")
  });
  assert.deepEqual(cleanPlan.suspectPrices, []);
  assert.deepEqual(cleanPlan.affectedSnapshotDates, []);

  console.log("Market close repair verification: success");
}

function fixtureData() {
  const accounts = [account("account-a")];
  const instruments = [
    instrument("cn-etf", "CN ETF", "CNY", "eastmoney", "SZSE"),
    instrument("pie", "Foundation Series US 500 Fund", "NZD", "custom", "INVESTNOW"),
    instrument("manual-hk", "Manual HK Price", "HKD", "manual", "HKEX")
  ];
  const transactions = [
    transaction("t-cn", "account-a", "cn-etf", "2026-05-01", "10", "10", "100", "CNY"),
    transaction("t-pie", "account-a", "pie", "2026-05-01", "10", "10", "100", "NZD")
  ];
  const rates = [rate("cny", "CNY", "2026-05-29", "0.14"), rate("nzd", "NZD", "2026-05-29", "0.60")];
  const prices = [
    repairPrice("cn-live", "cn-etf", "2026-05-29", "11", "CNY", "Eastmoney", "161128", "2026-05-29T06:00:00.000Z", "eastmoney", "SZSE"),
    repairPrice("cn-close", "cn-etf", "2026-05-28", "10", "CNY", "Eastmoney", "161128", "2026-05-29T06:00:00.000Z", "eastmoney", "SZSE"),
    repairPrice("cn-next", "cn-etf", "2026-05-31", "12", "CNY", "Eastmoney", "161128", "2026-05-31T07:20:00.000Z", "eastmoney", "SZSE"),
    repairPrice("pie-lagged", "pie", "2026-05-27", "12", "NZD", "FundRock", "FS_US_500", "2026-05-29T06:00:00.000Z", "custom", "INVESTNOW"),
    repairPrice("manual-hk-same-day", "manual-hk", "2026-05-29", "20", "HKD", "manual", "MANUAL_HK", "2026-05-29T06:00:00.000Z", "manual", "HKEX")
  ];
  const snapshots = [
    { id: "snapshot-2026-05-28", snapshot_date: "2026-05-28" },
    { id: "snapshot-2026-05-29", snapshot_date: "2026-05-29" },
    { id: "snapshot-2026-05-30", snapshot_date: "2026-05-30" }
  ];

  return { accounts, instruments, transactions, rates, prices, snapshots };
}

function account(id: string): InvestmentAccount {
  return {
    id,
    name: id,
    broker: null,
    accountType: "brokerage",
    baseCurrency: "USD",
    marketRegion: "US",
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function instrument(
  id: string,
  name: string,
  currency: Instrument["currency"],
  priceSource: Instrument["priceSource"],
  exchange: string
): Instrument {
  return {
    id,
    symbol: id,
    name,
    shortName: id,
    description: null,
    marketRegion: currency === "CNY" ? "CN" : "NZ",
    exchange,
    currency,
    assetType: currency === "NZD" ? "pie_fund" : "etf",
    isin: null,
    provider: null,
    priceSource,
    priceSourceSymbol: id,
    priceSourceExchange: exchange,
    priceUpdateEnabled: true,
    priceUpdatePriority: 100,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function transaction(
  id: string,
  accountId: string,
  instrumentId: string,
  tradeDate: string,
  quantity: string,
  priceValue: string,
  grossAmount: string,
  currency: InvestmentTransaction["currency"]
): InvestmentTransaction {
  return {
    id,
    accountId,
    instrumentId,
    transactionType: "opening_position",
    tradeDate,
    settlementDate: null,
    quantity,
    price: priceValue,
    grossAmount,
    fee: "0",
    tax: "0",
    currency,
    adjustmentDirection: null,
    transactionSource: "manual",
    linkedTransactionId: null,
    settlementCurrency: null,
    settlementAmount: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `${tradeDate}T00:00:00.000Z`,
    updatedAt: `${tradeDate}T00:00:00.000Z`
  };
}

function repairPrice(
  id: string,
  instrumentId: string,
  priceDate: string,
  closePrice: string,
  currency: InstrumentPriceRecord["currency"],
  provider: string,
  sourceSymbol: string,
  fetchedAt: string,
  priceSource: Instrument["priceSource"],
  sourceExchange: string
) {
  return {
    id,
    instrumentId,
    priceDate,
    closePrice,
    currency,
    provider,
    sourceSymbol,
    isAdjusted: false,
    fetchedAt,
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    priceSource,
    sourceExchange,
    instrumentName: instrumentId,
    instrumentSymbol: sourceSymbol
  };
}

function rate(
  id: string,
  fromCurrency: ExchangeRateRecord["fromCurrency"],
  rateDate: string,
  rateValue: string
): ExchangeRateRecord {
  return {
    id,
    fromCurrency,
    toCurrency: "USD",
    rateDate,
    rate: rateValue,
    rateType: "valuation",
    provider: "manual",
    providerRateDate: rateDate,
    fetchedAt: `${rateDate}T00:00:00.000Z`,
    createdAt: `${rateDate}T00:00:00.000Z`,
    updatedAt: `${rateDate}T00:00:00.000Z`
  };
}
