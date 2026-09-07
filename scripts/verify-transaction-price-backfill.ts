import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CreateInstrumentPriceInput, Instrument, InvestmentTransaction } from "@family-ledger/shared";
import {
  buildTransactionPriceRecordInput,
  reconcileTransactionPrice
} from "../apps/api/src/services/transactionService";

const stock = instrument("instrument-stock", "SMH.L", "stock", "USD");
const cash = instrument("instrument-cash", "CASH_USD", "cash", "USD");

const pastBuyPrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    tradeDate: "2026-06-22",
    price: "124.9"
  }),
  stock,
  "2026-06-24"
);
assert.deepEqual(pastBuyPrice, {
  instrumentId: "instrument-stock",
  priceDate: "2026-06-22",
  closePrice: "124.9",
  currency: "USD",
  provider: "manual",
  sourceSymbol: "SMH.L",
  isAdjusted: false,
  fetchedAt: "2026-06-24T10:26:41.679Z",
  sourceTransactionId: "transaction-a"
});

const pastSellPrice = buildTransactionPriceRecordInput(
  transaction("sell", {
    tradeDate: "2026-06-22",
    price: "125.5"
  }),
  stock,
  "2026-06-24"
);
assert.equal(pastSellPrice?.closePrice, "125.5");

const currentBusinessDatePrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    tradeDate: "2026-06-24",
    price: "124.9"
  }),
  stock,
  "2026-06-24"
);
assert.equal(currentBusinessDatePrice, null);

const dividendPrice = buildTransactionPriceRecordInput(
  transaction("dividend", {
    tradeDate: "2026-06-22",
    price: null
  }),
  stock,
  "2026-06-24"
);
assert.equal(dividendPrice, null);

const cashPrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    instrumentId: cash.id,
    tradeDate: "2026-06-22",
    price: "1"
  }),
  cash,
  "2026-06-24"
);
assert.equal(cashPrice, null);

const correctedHistoricalPrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    tradeDate: "2026-06-04",
    price: "7.281",
    currency: "CNY"
  }),
  instrument("instrument-stock", "161128", "fund", "CNY"),
  "2026-09-06"
);
assert.equal(correctedHistoricalPrice?.priceDate, "2026-06-04");
assert.equal(correctedHistoricalPrice?.sourceTransactionId, "transaction-a");

const correctedToCurrentDate = buildTransactionPriceRecordInput(
  transaction("buy", { tradeDate: "2026-09-06", price: "7.281", currency: "CNY" }),
  instrument("instrument-stock", "161128", "fund", "CNY"),
  "2026-09-06"
);
assert.equal(correctedToCurrentDate, null);

const migration = readFileSync(
  new URL("../supabase/migrations/20260907010000_link_transaction_generated_prices.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /source_transaction_id uuid/i);
assert.match(migration, /references public\.transactions\(id\)[\s\S]*on delete cascade/i);
assert.match(migration, /where source_transaction_id is not null/i);

void verifyLifecycle();

async function verifyLifecycle(): Promise<void> {
  const lifecycleCalls: string[] = [];
  const insertedPrices: CreateInstrumentPriceInput[] = [];
  let independentPriceExists = false;
  const dependencies = {
    async deleteOwnedPrice(sourceTransactionId: string) {
      lifecycleCalls.push(`delete:${sourceTransactionId}`);
    },
    async findInstrument() {
      return stock;
    },
    async hasPriceOnDate() {
      return independentPriceExists;
    },
    async insertPrice(input: CreateInstrumentPriceInput) {
      insertedPrices.push(input);
    }
  };

  await reconcileTransactionPrice(transaction("buy", { tradeDate: "2026-06-22" }), "2026-06-24", dependencies);
  assert.deepEqual(lifecycleCalls, ["delete:transaction-a"]);
  assert.equal(insertedPrices.at(-1)?.priceDate, "2026-06-22");

  await reconcileTransactionPrice(transaction("buy", { tradeDate: "2026-06-24" }), "2026-06-24", dependencies);
  assert.equal(insertedPrices.length, 1, "editing to the current date must remove rather than replace its owned price");

  independentPriceExists = true;
  await reconcileTransactionPrice(transaction("buy", { tradeDate: "2026-06-21" }), "2026-06-24", dependencies);
  assert.equal(insertedPrices.length, 1, "an independent same-day price must be preserved without a generated replacement");
  assert.deepEqual(lifecycleCalls, ["delete:transaction-a", "delete:transaction-a", "delete:transaction-a"]);

  console.log("Transaction price backfill verification: success");
}

function transaction(
  transactionType: InvestmentTransaction["transactionType"],
  values: Partial<InvestmentTransaction>
): InvestmentTransaction {
  return {
    id: "transaction-a",
    accountId: "account-a",
    instrumentId: "instrument-stock",
    instrumentSymbol: "SMH.L",
    instrumentName: "VanEck Semiconductor UCITS ETF Acc",
    instrumentShortName: "SMH.L",
    instrumentAssetType: "stock",
    transactionType,
    tradeDate: "2026-06-22",
    settlementDate: null,
    quantity: "1",
    price: "124.9",
    grossAmount: "124.900000",
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    transactionSource: "manual",
    linkedTransactionId: null,
    settlementCurrency: "USD",
    settlementAmount: "124.900000",
    notes: null,
    createdByUserId: "user-a",
    updatedByUserId: "user-a",
    createdAt: "2026-06-24T10:26:41.679Z",
    updatedAt: "2026-06-24T10:26:41.679Z",
    ...values
  };
}

function instrument(
  id: string,
  symbol: string,
  assetType: Instrument["assetType"],
  currency: Instrument["currency"]
): Instrument {
  return {
    id,
    symbol,
    name: symbol,
    shortName: symbol,
    description: null,
    marketRegion: "US",
    exchange: "TEST",
    currency,
    assetType,
    isin: null,
    provider: null,
    priceSource: "manual",
    priceSourceSymbol: symbol,
    priceSourceExchange: "TEST",
    priceUpdateEnabled: false,
    priceUpdatePriority: 0,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z"
  };
}
