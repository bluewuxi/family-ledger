import assert from "node:assert/strict";
import type {
  CreateExchangeRateInput,
  CreateInstrumentPriceInput,
  DataProviderRun,
  ExchangeRateRecord,
  InstrumentPriceRecord,
  JobRun
} from "@family-ledger/shared";
import { CURRENCY_CODES, DATA_KINDS, JOB_RUN_STATUSES, RATE_TYPES } from "../packages/shared/src/index";

assert.deepEqual(RATE_TYPES, ["valuation", "tax"]);
assert.deepEqual(JOB_RUN_STATUSES, ["started", "succeeded", "failed"]);
assert.deepEqual(DATA_KINDS, ["exchange_rates", "instrument_prices"]);
assert.ok(CURRENCY_CODES.includes("USD"));

const exchangeRateInput: CreateExchangeRateInput = {
  rateDate: "2026-05-22",
  fromCurrency: "NZD",
  toCurrency: "USD",
  rate: "0.6100000000",
  rateType: "valuation",
  provider: "manual",
  providerRateDate: "2026-05-22",
  fetchedAt: "2026-05-23T01:00:00.000Z"
};

assert.equal(exchangeRateInput.toCurrency, "USD");
assert.equal(exchangeRateInput.rateType, "valuation");

const exchangeRateRecord: ExchangeRateRecord = {
  id: "exchange-rate-id",
  ...exchangeRateInput,
  toCurrency: exchangeRateInput.toCurrency ?? "USD",
  rateType: exchangeRateInput.rateType ?? "valuation",
  providerRateDate: exchangeRateInput.providerRateDate ?? null,
  fetchedAt: exchangeRateInput.fetchedAt ?? null,
  createdAt: "2026-05-23T01:00:00.000Z",
  updatedAt: "2026-05-23T01:00:00.000Z"
};

assert.equal(exchangeRateRecord.rate, "0.6100000000");

const priceInput: CreateInstrumentPriceInput = {
  instrumentId: "instrument-id",
  priceDate: "2026-05-22",
  closePrice: "123.4500000000",
  currency: "USD",
  provider: "manual",
  sourceSymbol: "VGT",
  isAdjusted: false,
  fetchedAt: "2026-05-23T01:00:00.000Z"
};

const priceRecord: InstrumentPriceRecord = {
  id: "instrument-price-id",
  ...priceInput,
  sourceSymbol: priceInput.sourceSymbol ?? null,
  isAdjusted: priceInput.isAdjusted ?? false,
  fetchedAt: priceInput.fetchedAt ?? null,
  createdAt: "2026-05-23T01:00:00.000Z",
  updatedAt: "2026-05-23T01:00:00.000Z"
};

assert.equal(priceRecord.provider, "manual");

const jobRun: JobRun = {
  id: "job-run-id",
  jobName: "update-market-data",
  status: "started",
  jobStartedAt: "2026-05-23T01:00:00.000Z",
  jobFinishedAt: null,
  recordsInserted: 0,
  recordsSkipped: 0,
  errorMessage: null,
  createdAt: "2026-05-23T01:00:00.000Z",
  updatedAt: "2026-05-23T01:00:00.000Z"
};

const providerRun: DataProviderRun = {
  id: "provider-run-id",
  jobRunId: jobRun.id,
  provider: "manual",
  dataKind: "exchange_rates",
  status: "started",
  providerStartedAt: jobRun.jobStartedAt,
  providerFinishedAt: null,
  recordsInserted: 0,
  recordsSkipped: 0,
  errorMessage: null,
  createdAt: jobRun.createdAt,
  updatedAt: jobRun.updatedAt
};

assert.equal(providerRun.jobRunId, jobRun.id);

console.log("Market data foundation verification: success");
