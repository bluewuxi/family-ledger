import assert from "node:assert/strict";
import type { ScheduledEvent } from "aws-lambda";
import type {
  CreateExchangeRateInput,
  DataKind,
  DataProviderRun,
  ExchangeRateRecord,
  JobRun
} from "@family-ledger/shared";
import type { IFxRateProvider } from "../apps/jobs/src/providers/IFxRateProvider";
import { createUpdateFxRatesHandler } from "../apps/jobs/src/handlers/updateFxRates";
import {
  FRANKFURTER_FX_JOB_NAME,
  type FxRateIngestionResult,
  ingestLatestFrankfurterFxRates,
  toExchangeRateInputs
} from "../apps/jobs/src/services/fxRateIngestionService";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const converted = toExchangeRateInputs("2026-05-22", "2026-05-23T01:00:00.000Z", "Frankfurter", [
    { currency: "NZD", providerRate: "1.632" },
    { currency: "CNY", providerRate: "7.121" },
    { currency: "HKD", providerRate: "7.849" },
    { currency: "EUR", providerRate: "0.923" },
    { currency: "GBP", providerRate: "0.784" }
  ]);

  assert.deepEqual(
    converted.map((rate) => [
      rate.fromCurrency,
      rate.toCurrency,
      rate.rate,
      rate.rateType,
      rate.provider,
      rate.rateDate,
      rate.providerRateDate,
      rate.fetchedAt
    ]),
    [
      ["NZD", "USD", "0.6127450980", "valuation", "Frankfurter", "2026-05-22", "2026-05-22", "2026-05-23T01:00:00.000Z"],
      ["CNY", "USD", "0.1404297149", "valuation", "Frankfurter", "2026-05-22", "2026-05-22", "2026-05-23T01:00:00.000Z"],
      ["HKD", "USD", "0.1274047649", "valuation", "Frankfurter", "2026-05-22", "2026-05-22", "2026-05-23T01:00:00.000Z"],
      ["EUR", "USD", "1.0834236186", "valuation", "Frankfurter", "2026-05-22", "2026-05-22", "2026-05-23T01:00:00.000Z"],
      ["GBP", "USD", "1.2755102041", "valuation", "Frankfurter", "2026-05-22", "2026-05-22", "2026-05-23T01:00:00.000Z"]
    ]
  );

  const calls: string[] = [];
  const insertedInputs: CreateExchangeRateInput[] = [];
  const provider: IFxRateProvider = {
    name: "Frankfurter",
    async fetchLatestRates(input) {
      calls.push(`fetch:${input.fetchedAt}:${input.targetCurrencies.join(",")}`);
      return {
        provider: "Frankfurter",
        baseCurrency: "USD",
        rateDate: "2026-05-22",
        fetchedAt: input.fetchedAt,
        rates: [
          { currency: "NZD", providerRate: "1.632" },
          { currency: "CNY", providerRate: "7.121" },
          { currency: "HKD", providerRate: "7.849" },
          { currency: "EUR", providerRate: "0.923" },
          { currency: "GBP", providerRate: "0.784" }
        ]
      };
    }
  };

  const jobRepo = createFakeJobRunRepository(calls);
  const persistedKeys = new Set<string>();
  const exchangeRateRepository = {
    async insertExchangeRateIfNotExists(input: CreateExchangeRateInput) {
      insertedInputs.push(input);
      const key = `${input.fromCurrency}:${input.toCurrency ?? "USD"}:${input.rateType ?? "valuation"}:${input.provider}:${input.rateDate}`;
      const inserted = !persistedKeys.has(key);
      persistedKeys.add(key);
      return {
        inserted,
        record: exchangeRateRecord(input)
      };
    }
  };
  const result = await ingestLatestFrankfurterFxRates({
    targetCurrencies: ["NZD", "CNY", "HKD", "EUR", "GBP"],
    fetchedAt: "2026-05-23T01:00:00.000Z",
    now: fixedNow(),
    provider,
    jobRunRepository: jobRepo,
    exchangeRateRepository
  });

  assert.equal(result.rateDate, "2026-05-22");
  assert.equal(result.fetchedAt, "2026-05-23T01:00:00.000Z");
  assert.equal(result.recordsInserted, 5);
  assert.equal(result.recordsSkipped, 0);
  assert.deepEqual(insertedInputs.map((input) => input.fromCurrency), ["NZD", "CNY", "HKD", "EUR", "GBP"]);
  assert.deepEqual(insertedInputs.map((input) => input.rate), [
    "0.6127450980",
    "0.1404297149",
    "0.1274047649",
    "1.0834236186",
    "1.2755102041"
  ]);
  assert.ok(calls.includes(`job:start:${FRANKFURTER_FX_JOB_NAME}:2026-05-23T01:00:00.000Z`));
  assert.ok(calls.includes("provider:start:Frankfurter:exchange_rates:2026-05-23T01:00:00.000Z"));
  assert.ok(calls.includes("provider:finish:succeeded:5:0"));
  assert.ok(calls.includes("job:finish:succeeded:5:0"));

  const secondRun = await ingestLatestFrankfurterFxRates({
    targetCurrencies: ["NZD", "CNY", "HKD", "EUR", "GBP"],
    fetchedAt: "2026-05-23T02:00:00.000Z",
    now: fixedNow(),
    provider,
    jobRunRepository: createFakeJobRunRepository([]),
    exchangeRateRepository
  });

  assert.equal(secondRun.recordsInserted, 0);
  assert.equal(secondRun.recordsSkipped, 5);

  const failureCalls: string[] = [];
  await assert.rejects(
    ingestLatestFrankfurterFxRates({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      now: fixedNow(),
      provider: {
        name: "Frankfurter",
        async fetchLatestRates() {
          throw new Error("mock provider failure");
        }
      },
      jobRunRepository: createFakeJobRunRepository(failureCalls),
      accountCurrencyRepository: {
        async listDistinctAccountAndInstrumentCurrencies() {
          return ["NZD"];
        }
      },
      exchangeRateRepository: {
        async insertExchangeRateIfNotExists(input) {
          return { inserted: true, record: exchangeRateRecord(input) };
        }
      }
    }),
    /mock provider failure/
  );
  assert.ok(failureCalls.includes("provider:finish:failed:0:0:mock provider failure"));
  assert.ok(failureCalls.includes("job:finish:failed:0:0:mock provider failure"));

  const handlerCalls: string[] = [];
  const handler = createUpdateFxRatesHandler({
    async ingestLatestFrankfurterFxRates() {
      handlerCalls.push("handler:ingest");
      return fxRateIngestionResult();
    }
  });
  await withMutedConsole(() => handler(scheduledEvent()));
  assert.deepEqual(handlerCalls, ["handler:ingest"]);

  const failingHandler = createUpdateFxRatesHandler({
    async ingestLatestFrankfurterFxRates() {
      throw new Error("mock handler failure");
    }
  });
  await assert.rejects(withMutedConsole(() => failingHandler(scheduledEvent())), /mock handler failure/);

  console.log("Frankfurter ingestion verification: success");
}

function fixedNow(): () => Date {
  return () => new Date("2026-05-23T01:30:00.000Z");
}

function createFakeJobRunRepository(calls: string[]) {
  const jobRun = jobRunRecord("job-run-id");
  const providerRun = providerRunRecord("provider-run-id", jobRun.id);

  return {
    async createJobRun(input: { jobName: string; jobStartedAt: string }): Promise<JobRun> {
      calls.push(`job:start:${input.jobName}:${input.jobStartedAt}`);
      return { ...jobRun, jobName: input.jobName, jobStartedAt: input.jobStartedAt };
    },
    async finishJobRun(
      _id: string,
      input: {
        status: "succeeded" | "failed";
        finishedAt: string;
        recordsInserted?: number;
        recordsSkipped?: number;
        errorMessage?: string | null;
      }
    ): Promise<JobRun> {
      calls.push(
        `job:finish:${input.status}:${input.recordsInserted ?? 0}:${input.recordsSkipped ?? 0}${
          input.errorMessage ? `:${input.errorMessage}` : ""
        }`
      );
      return {
        ...jobRun,
        status: input.status,
        jobFinishedAt: input.finishedAt,
        recordsInserted: input.recordsInserted ?? 0,
        recordsSkipped: input.recordsSkipped ?? 0,
        errorMessage: input.errorMessage ?? null
      };
    },
    async createDataProviderRun(input: {
      jobRunId: string;
      provider: string;
      dataKind: DataKind;
      providerStartedAt: string;
    }): Promise<DataProviderRun> {
      calls.push(`provider:start:${input.provider}:${input.dataKind}:${input.providerStartedAt}`);
      return {
        ...providerRun,
        jobRunId: input.jobRunId,
        provider: input.provider,
        dataKind: input.dataKind,
        providerStartedAt: input.providerStartedAt
      };
    },
    async finishDataProviderRun(
      _id: string,
      input: {
        status: "succeeded" | "failed";
        finishedAt: string;
        recordsInserted?: number;
        recordsSkipped?: number;
        errorMessage?: string | null;
      }
    ): Promise<DataProviderRun> {
      calls.push(
        `provider:finish:${input.status}:${input.recordsInserted ?? 0}:${input.recordsSkipped ?? 0}${
          input.errorMessage ? `:${input.errorMessage}` : ""
        }`
      );
      return {
        ...providerRun,
        status: input.status,
        providerFinishedAt: input.finishedAt,
        recordsInserted: input.recordsInserted ?? 0,
        recordsSkipped: input.recordsSkipped ?? 0,
        errorMessage: input.errorMessage ?? null
      };
    }
  };
}

function exchangeRateRecord(input: CreateExchangeRateInput): ExchangeRateRecord {
  return {
    id: `${input.fromCurrency}-${input.rateDate}`,
    rateDate: input.rateDate,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency ?? "USD",
    rate: input.rate,
    rateType: input.rateType ?? "valuation",
    provider: input.provider,
    providerRateDate: input.providerRateDate ?? null,
    fetchedAt: input.fetchedAt ?? null,
    createdAt: "2026-05-23T01:00:00.000Z",
    updatedAt: "2026-05-23T01:00:00.000Z"
  };
}

function jobRunRecord(id: string): JobRun {
  return {
    id,
    jobName: FRANKFURTER_FX_JOB_NAME,
    status: "started",
    jobStartedAt: "2026-05-23T01:00:00.000Z",
    jobFinishedAt: null,
    recordsInserted: 0,
    recordsSkipped: 0,
    errorMessage: null,
    createdAt: "2026-05-23T01:00:00.000Z",
    updatedAt: "2026-05-23T01:00:00.000Z"
  };
}

function providerRunRecord(id: string, jobRunId: string): DataProviderRun {
  return {
    id,
    jobRunId,
    provider: "Frankfurter",
    dataKind: "exchange_rates",
    status: "started",
    providerStartedAt: "2026-05-23T01:00:00.000Z",
    providerFinishedAt: null,
    recordsInserted: 0,
    recordsSkipped: 0,
    errorMessage: null,
    createdAt: "2026-05-23T01:00:00.000Z",
    updatedAt: "2026-05-23T01:00:00.000Z"
  };
}

function fxRateIngestionResult(): FxRateIngestionResult {
  const jobRun = {
    ...jobRunRecord("handler-job-run-id"),
    status: "succeeded" as const,
    jobFinishedAt: "2026-05-23T01:30:00.000Z",
    recordsInserted: 5,
    recordsSkipped: 0
  };

  return {
    jobRun,
    dataProviderRun: {
      ...providerRunRecord("handler-provider-run-id", jobRun.id),
      status: "succeeded",
      providerFinishedAt: "2026-05-23T01:30:00.000Z",
      recordsInserted: 5,
      recordsSkipped: 0
    },
    rateDate: "2026-05-22",
    fetchedAt: "2026-05-23T01:00:00.000Z",
    provider: "Frankfurter",
    recordsInserted: 6,
    recordsSkipped: 0,
    exchangeRates: []
  };
}

function scheduledEvent(): ScheduledEvent {
  return {
    version: "0",
    id: "scheduled-event-id",
    "detail-type": "Scheduled Event",
    source: "aws.events",
    account: "123456789012",
    time: "2026-05-23T01:00:00Z",
    region: "ap-southeast-2",
    resources: ["arn:aws:events:ap-southeast-2:123456789012:rule/family-ledger-update-fx-rates"],
    detail: {}
  };
}

async function withMutedConsole(action: () => Promise<void>): Promise<void> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    await action();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
