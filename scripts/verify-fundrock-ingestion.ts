import assert from "node:assert/strict";
import type { ScheduledEvent } from "aws-lambda";
import type {
  CreateInstrumentPriceInput,
  DataKind,
  DataProviderRun,
  InstrumentPriceRecord,
  JobRun
} from "@family-ledger/shared";
import type { IInstrumentPriceProvider } from "../apps/jobs/src/providers/IInstrumentPriceProvider";
import { createUpdatePricesHandler } from "../apps/jobs/src/handlers/updatePrices";
import {
  FUNDROCK_PRICE_JOB_NAME,
  type FundRockPriceIngestionResult,
  ingestLatestFundRockPieUnitPrices,
  toInstrumentPriceInputs,
  toProviderInstruments
} from "../apps/jobs/src/services/fundRockPriceIngestionService";
import type { PriceEnabledInstrument } from "../apps/jobs/src/repositories/instrumentPriceRepository";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const providerInstruments = toProviderInstruments(priceEnabledInstruments());
  assert.deepEqual(
    providerInstruments.map((instrument) => [instrument.sourceSymbol, instrument.providerInstrumentName, instrument.currency]),
    [
      ["FS_NASDAQ_100", "Foundation Series Nasdaq-100 Fund", "NZD"],
      ["FS_TOTAL_WORLD", "Foundation Series Total World Fund", "NZD"],
      ["FS_US_500", "Foundation Series US 500 Fund", "NZD"]
    ]
  );

  const converted = toInstrumentPriceInputs(
    priceEnabledInstruments(),
    [
      { sourceSymbol: "FS_NASDAQ_100", priceDate: "2026-05-21", closePrice: "1.3895", currency: "NZD" },
      { sourceSymbol: "FS_TOTAL_WORLD", priceDate: "2026-05-21", closePrice: "1.986", currency: "NZD" },
      { sourceSymbol: "FS_US_500", priceDate: "2026-05-21", closePrice: "2.0731", currency: "NZD" }
    ],
    "FundRock",
    "2026-05-23T01:00:00.000Z"
  );

  assert.deepEqual(
    converted.map((input) => [
      input.instrumentId,
      input.priceDate,
      input.closePrice,
      input.currency,
      input.provider,
      input.sourceSymbol,
      input.isAdjusted,
      input.fetchedAt
    ]),
    [
      [
        "instrument-nasdaq-100",
        "2026-05-21",
        "1.3895",
        "NZD",
        "FundRock",
        "FS_NASDAQ_100",
        false,
        "2026-05-23T01:00:00.000Z"
      ],
      [
        "instrument-total-world",
        "2026-05-21",
        "1.986",
        "NZD",
        "FundRock",
        "FS_TOTAL_WORLD",
        false,
        "2026-05-23T01:00:00.000Z"
      ],
      [
        "instrument-us-500",
        "2026-05-21",
        "2.0731",
        "NZD",
        "FundRock",
        "FS_US_500",
        false,
        "2026-05-23T01:00:00.000Z"
      ]
    ]
  );

  const calls: string[] = [];
  const insertedInputs: CreateInstrumentPriceInput[] = [];
  const provider: IInstrumentPriceProvider = {
    name: "FundRock",
    async fetchLatestPrices(input) {
      calls.push(`fetch:${input.fetchedAt}:${input.instruments.map((instrument) => instrument.sourceSymbol).join(",")}`);
      return {
        provider: "FundRock",
        fetchedAt: input.fetchedAt,
        prices: [
          { sourceSymbol: "FS_NASDAQ_100", priceDate: "2026-05-21", closePrice: "1.3895", currency: "NZD" },
          { sourceSymbol: "FS_TOTAL_WORLD", priceDate: "2026-05-21", closePrice: "1.986", currency: "NZD" },
          { sourceSymbol: "FS_US_500", priceDate: "2026-05-21", closePrice: "2.0731", currency: "NZD" }
        ]
      };
    }
  };

  const persistedKeys = new Set<string>();
  const instrumentPriceRepository = {
    async listPriceEnabledInstrumentsBySource(input: { priceSource: "custom"; sourceSymbols: string[] }) {
      calls.push(`instruments:${input.priceSource}:${input.sourceSymbols.join(",")}`);
      return priceEnabledInstruments();
    },
    async insertInstrumentPriceIfNotExists(input: CreateInstrumentPriceInput) {
      insertedInputs.push(input);
      const key = `${input.instrumentId}:${input.provider}:${input.priceDate}`;
      const inserted = !persistedKeys.has(key);
      persistedKeys.add(key);
      return {
        inserted,
        record: instrumentPriceRecord(input)
      };
    }
  };

  const result = await ingestLatestFundRockPieUnitPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    now: fixedNow(),
    provider,
    jobRunRepository: createFakeJobRunRepository(calls),
    instrumentPriceRepository
  });

  assert.equal(result.fetchedAt, "2026-05-23T01:00:00.000Z");
  assert.equal(result.recordsInserted, 3);
  assert.equal(result.recordsSkipped, 0);
  assert.deepEqual(insertedInputs.map((input) => input.sourceSymbol), ["FS_NASDAQ_100", "FS_TOTAL_WORLD", "FS_US_500"]);
  assert.ok(calls.includes(`job:start:${FUNDROCK_PRICE_JOB_NAME}:2026-05-23T01:00:00.000Z`));
  assert.ok(calls.includes("provider:start:FundRock:instrument_prices:2026-05-23T01:00:00.000Z"));
  assert.ok(calls.includes("provider:finish:succeeded:3:0"));
  assert.ok(calls.includes("job:finish:succeeded:3:0"));

  const secondRun = await ingestLatestFundRockPieUnitPrices({
    fetchedAt: "2026-05-23T02:00:00.000Z",
    now: fixedNow(),
    provider,
    jobRunRepository: createFakeJobRunRepository([]),
    instrumentPriceRepository
  });

  assert.equal(secondRun.recordsInserted, 0);
  assert.equal(secondRun.recordsSkipped, 3);

  const failureCalls: string[] = [];
  await assert.rejects(
    ingestLatestFundRockPieUnitPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      now: fixedNow(),
      provider: {
        name: "FundRock",
        async fetchLatestPrices() {
          throw new Error("mock provider failure");
        }
      },
      jobRunRepository: createFakeJobRunRepository(failureCalls),
      instrumentPriceRepository
    }),
    /mock provider failure/
  );
  assert.ok(failureCalls.includes("provider:finish:failed:0:0:mock provider failure"));
  assert.ok(failureCalls.includes("job:finish:failed:0:0:mock provider failure"));

  const handlerCalls: string[] = [];
  const handler = createUpdatePricesHandler({
    async ingestLatestFundRockPieUnitPrices() {
      handlerCalls.push("handler:ingest");
      return fundRockPriceIngestionResult();
    }
  });
  await withMutedConsole(() => handler(scheduledEvent()));
  assert.deepEqual(handlerCalls, ["handler:ingest"]);

  const failingHandler = createUpdatePricesHandler({
    async ingestLatestFundRockPieUnitPrices() {
      throw new Error("mock handler failure");
    }
  });
  await assert.rejects(withMutedConsole(() => failingHandler(scheduledEvent())), /mock handler failure/);

  console.log("FundRock ingestion verification: success");
}

function fixedNow(): () => Date {
  return () => new Date("2026-05-23T01:30:00.000Z");
}

function priceEnabledInstruments(): PriceEnabledInstrument[] {
  return [
    {
      id: "instrument-nasdaq-100",
      name: "Foundation Series Nasdaq-100 Fund",
      currency: "NZD",
      priceSource: "custom",
      priceSourceSymbol: "FS_NASDAQ_100"
    },
    {
      id: "instrument-total-world",
      name: "Foundation Series Total World Fund",
      currency: "NZD",
      priceSource: "custom",
      priceSourceSymbol: "FS_TOTAL_WORLD"
    },
    {
      id: "instrument-us-500",
      name: "Foundation Series US 500 Fund",
      currency: "NZD",
      priceSource: "custom",
      priceSourceSymbol: "FS_US_500"
    }
  ];
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

function instrumentPriceRecord(input: CreateInstrumentPriceInput): InstrumentPriceRecord {
  return {
    id: `${input.instrumentId}-${input.priceDate}`,
    instrumentId: input.instrumentId,
    priceDate: input.priceDate,
    closePrice: input.closePrice,
    currency: input.currency,
    provider: input.provider,
    sourceSymbol: input.sourceSymbol ?? null,
    isAdjusted: input.isAdjusted ?? false,
    fetchedAt: input.fetchedAt ?? null,
    createdAt: "2026-05-23T01:00:00.000Z",
    updatedAt: "2026-05-23T01:00:00.000Z"
  };
}

function jobRunRecord(id: string): JobRun {
  return {
    id,
    jobName: FUNDROCK_PRICE_JOB_NAME,
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
    provider: "FundRock",
    dataKind: "instrument_prices",
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

function fundRockPriceIngestionResult(): FundRockPriceIngestionResult {
  const jobRun = {
    ...jobRunRecord("handler-job-run-id"),
    status: "succeeded" as const,
    jobFinishedAt: "2026-05-23T01:30:00.000Z",
    recordsInserted: 3,
    recordsSkipped: 0
  };

  return {
    jobRun,
    dataProviderRun: {
      ...providerRunRecord("handler-provider-run-id", jobRun.id),
      status: "succeeded",
      providerFinishedAt: "2026-05-23T01:30:00.000Z",
      recordsInserted: 3,
      recordsSkipped: 0
    },
    fetchedAt: "2026-05-23T01:00:00.000Z",
    provider: "FundRock",
    recordsInserted: 3,
    recordsSkipped: 0,
    instrumentPrices: []
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
    resources: ["arn:aws:events:ap-southeast-2:123456789012:rule/family-ledger-update-prices"],
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
