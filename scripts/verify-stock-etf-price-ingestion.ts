import assert from "node:assert/strict";
import type { ScheduledEvent } from "aws-lambda";
import type {
  CreateInstrumentPriceInput,
  DataKind,
  DataProviderRun,
  InstrumentPriceRecord,
  JobRun
} from "@family-ledger/shared";
import { createUpdatePricesHandler } from "../apps/jobs/src/handlers/updatePrices";
import type { IInstrumentPriceProvider } from "../apps/jobs/src/providers/IInstrumentPriceProvider";
import type { PriceEnabledInstrument } from "../apps/jobs/src/repositories/instrumentPriceRepository";
import {
  ingestLatestInstrumentPrices,
  toInstrumentPriceInputs,
  toProviderInstruments,
  UPDATE_PRICES_JOB_NAME,
  type InstrumentPriceIngestionResult,
  type InstrumentPriceProviderConfig
} from "../apps/jobs/src/services/instrumentPriceIngestionService";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  assert.deepEqual(
    toProviderInstruments(priceEnabledInstruments("yahoo_finance")).map((instrument) => [
      instrument.sourceSymbol,
      instrument.providerInstrumentName,
      instrument.currency,
      instrument.sourceExchange
    ]),
    [
      ["AMD", "Advanced Micro Devices, Inc.", "USD", "NASDAQ"],
      ["VOO", "Vanguard S&P 500 ETF", "USD", "NYSE_ARCA"],
      ["1810.HK", "Xiaomi Corporation", "HKD", "HKEX"]
    ]
  );

  assert.deepEqual(
    toInstrumentPriceInputs(
      priceEnabledInstruments("yahoo_finance"),
      [
        { sourceSymbol: "AMD", priceDate: "2026-05-20", closePrice: "123.45", currency: "USD" },
        { sourceSymbol: "VOO", priceDate: "2026-05-20", closePrice: "537.50", currency: "USD" },
        { sourceSymbol: "1810.HK", priceDate: "2026-05-20", closePrice: "41.2", currency: "HKD" }
      ],
      "Yahoo Finance",
      "2026-05-23T01:00:00.000Z"
    ).map((input) => [input.instrumentId, input.provider, input.sourceSymbol, input.closePrice, input.currency]),
    [
      ["instrument-amd", "Yahoo Finance", "AMD", "123.45", "USD"],
      ["instrument-voo", "Yahoo Finance", "VOO", "537.50", "USD"],
      ["instrument-1810", "Yahoo Finance", "1810.HK", "41.2", "HKD"]
    ]
  );

  await assert.rejects(
    async () =>
      toInstrumentPriceInputs(
        priceEnabledInstruments("yahoo_finance"),
        [{ sourceSymbol: "AMD", priceDate: "2026-05-20", closePrice: "123.45", currency: "USD" }],
        "Yahoo Finance",
        "2026-05-23T01:00:00.000Z"
      ),
    /did not return prices/
  );
  await assert.rejects(
    async () =>
      toInstrumentPriceInputs(
        priceEnabledInstruments("yahoo_finance"),
        [
          { sourceSymbol: "AMD", priceDate: "2026-05-20", closePrice: "123.45", currency: "USD" },
          { sourceSymbol: "VOO", priceDate: "2026-05-20", closePrice: "537.50", currency: "USD" },
          { sourceSymbol: "1810.HK", priceDate: "2026-05-20", closePrice: "41.2", currency: "HKD" },
          { sourceSymbol: "UNKNOWN", priceDate: "2026-05-20", closePrice: "41.2", currency: "HKD" }
        ],
        "Yahoo Finance",
        "2026-05-23T01:00:00.000Z"
      ),
    /unknown source symbol/
  );

  const calls: string[] = [];
  const insertedInputs: CreateInstrumentPriceInput[] = [];
  const persistedKeys = new Set<string>();
  const result = await ingestLatestInstrumentPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    now: fixedNow(),
    providerConfigs: providerConfigs(),
    jobRunRepository: createFakeJobRunRepository(calls),
    instrumentPriceRepository: {
      async listPriceEnabledInstrumentsBySource(input) {
        calls.push(`instruments:${input.priceSource}:${input.sourceSymbols.join(",")}`);
        return priceEnabledInstruments(input.priceSource);
      },
      async insertInstrumentPriceIfNotExists(input) {
        insertedInputs.push(input);
        const key = `${input.instrumentId}:${input.provider}:${input.priceDate}`;
        const inserted = !persistedKeys.has(key);
        persistedKeys.add(key);
        return { inserted, record: instrumentPriceRecord(input) };
      }
    }
  });

  assert.equal(result.recordsInserted, 6);
  assert.equal(result.recordsSkipped, 0);
  assert.deepEqual(result.providerRuns.map((run) => run.provider), ["Yahoo Finance", "Eastmoney", "FundRock"]);
  assert.deepEqual(insertedInputs.map((input) => input.sourceSymbol), ["AMD", "VOO", "1810.HK", "161128", "159501", "FS_US_500"]);
  assert.ok(calls.includes(`job:start:${UPDATE_PRICES_JOB_NAME}:2026-05-23T01:00:00.000Z`));
  assert.ok(calls.includes("provider:start:Yahoo Finance:instrument_prices:2026-05-23T01:00:00.000Z"));
  assert.ok(calls.includes("provider:start:Eastmoney:instrument_prices:2026-05-23T01:00:00.000Z"));
  assert.ok(calls.includes("provider:start:FundRock:instrument_prices:2026-05-23T01:00:00.000Z"));
  assert.ok(calls.includes("job:finish:succeeded:6:0"));

  const secondRun = await ingestLatestInstrumentPrices({
    fetchedAt: "2026-05-23T02:00:00.000Z",
    now: fixedNow(),
    providerConfigs: providerConfigs(),
    jobRunRepository: createFakeJobRunRepository([]),
    instrumentPriceRepository: {
      async listPriceEnabledInstrumentsBySource(input) {
        return priceEnabledInstruments(input.priceSource);
      },
      async insertInstrumentPriceIfNotExists(input) {
        const key = `${input.instrumentId}:${input.provider}:${input.priceDate}`;
        const inserted = !persistedKeys.has(key);
        persistedKeys.add(key);
        return { inserted, record: instrumentPriceRecord(input) };
      }
    }
  });
  assert.equal(secondRun.recordsInserted, 0);
  assert.equal(secondRun.recordsSkipped, 6);

  const preCloseInputs = toInstrumentPriceInputs(
    priceEnabledInstruments("eastmoney"),
    [
      { sourceSymbol: "161128", priceDate: "2026-05-29", closePrice: "1.1", currency: "CNY" },
      { sourceSymbol: "159501", priceDate: "2026-05-29", closePrice: "1.2", currency: "CNY" }
    ],
    "Eastmoney",
    "2026-05-29T06:00:00.000Z"
  );
  assert.deepEqual(preCloseInputs, []);

  const closePolicyCalls: string[] = [];
  const closePolicyRun = await withMutedConsole(() =>
    ingestLatestInstrumentPrices({
      fetchedAt: "2026-05-29T06:00:00.000Z",
      now: fixedNow(),
      providerConfigs: [providerConfig("eastmoney", ["161128", "159501"], providerReturningDate("Eastmoney", "CNY", "2026-05-29"))],
      jobRunRepository: createFakeJobRunRepository(closePolicyCalls),
      instrumentPriceRepository: {
        async listPriceEnabledInstrumentsBySource(input) {
          return priceEnabledInstruments(input.priceSource);
        },
        async insertInstrumentPriceIfNotExists(input) {
          return { inserted: true, record: instrumentPriceRecord(input) };
        }
      }
    })
  );
  assert.equal(closePolicyRun.recordsInserted, 0);
  assert.equal(closePolicyRun.recordsSkipped, 2);
  assert.equal(closePolicyRun.providerRuns[0]?.recordsSkippedByClosePolicy, 2);
  assert.ok(closePolicyCalls.includes("provider:finish:succeeded:0:2"));

  const postCloseInputs = toInstrumentPriceInputs(
    priceEnabledInstruments("eastmoney").filter((instrument) => instrument.priceSourceSymbol === "161128"),
    [{ sourceSymbol: "161128", priceDate: "2026-05-29", closePrice: "1.1", currency: "CNY" }],
    "Eastmoney",
    "2026-05-29T07:20:00.000Z"
  );
  assert.deepEqual(postCloseInputs.map((input) => [input.sourceSymbol, input.priceDate]), [["161128", "2026-05-29"]]);

  const preHkCloseInputs = toInstrumentPriceInputs(
    priceEnabledInstruments("yahoo_finance"),
    [
      { sourceSymbol: "AMD", priceDate: "2026-05-28", closePrice: "123.45", currency: "USD" },
      { sourceSymbol: "VOO", priceDate: "2026-05-28", closePrice: "537.50", currency: "USD" },
      { sourceSymbol: "1810.HK", priceDate: "2026-05-29", closePrice: "41.2", currency: "HKD" }
    ],
    "Yahoo Finance",
    "2026-05-29T07:30:00.000Z"
  );
  assert.deepEqual(preHkCloseInputs.map((input) => input.sourceSymbol), ["AMD", "VOO"]);

  const laggedFundRockInputs = toInstrumentPriceInputs(
    priceEnabledInstruments("custom"),
    [{ sourceSymbol: "FS_US_500", priceDate: "2026-05-27", closePrice: "1.23", currency: "NZD" }],
    "FundRock",
    "2026-05-29T06:00:00.000Z"
  );
  assert.deepEqual(laggedFundRockInputs.map((input) => [input.sourceSymbol, input.priceDate]), [["FS_US_500", "2026-05-27"]]);

  const failureCalls: string[] = [];
  await assert.rejects(
    ingestLatestInstrumentPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      now: fixedNow(),
      providerConfigs: [
        providerConfig("yahoo_finance", ["AMD"], providerReturning("Yahoo Finance", "USD")),
        providerConfig("eastmoney", ["161128"], providerFailing("Eastmoney"))
      ],
      jobRunRepository: createFakeJobRunRepository(failureCalls),
      instrumentPriceRepository: {
        async listPriceEnabledInstrumentsBySource(input) {
          return priceEnabledInstruments(input.priceSource).slice(0, 1);
        },
        async insertInstrumentPriceIfNotExists(input) {
          return { inserted: true, record: instrumentPriceRecord(input) };
        }
      }
    }),
    /Eastmoney: mock Eastmoney failure/
  );
  assert.ok(failureCalls.includes("provider:finish:succeeded:1:0"));
  assert.ok(failureCalls.includes("provider:finish:failed:0:0:mock Eastmoney failure"));
  assert.ok(failureCalls.includes("job:finish:failed:1:0:Eastmoney: mock Eastmoney failure"));

  const handlerCalls: string[] = [];
  const handler = createUpdatePricesHandler({
    async ingestLatestInstrumentPrices() {
      handlerCalls.push("handler:ingest");
      return instrumentPriceIngestionResult();
    }
  });
  await withMutedConsole(() => handler(scheduledEvent()));
  assert.deepEqual(handlerCalls, ["handler:ingest"]);

  const failingHandler = createUpdatePricesHandler({
    async ingestLatestInstrumentPrices() {
      throw new Error("mock handler failure");
    }
  });
  await assert.rejects(withMutedConsole(() => failingHandler(scheduledEvent())), /mock handler failure/);

  console.log("Stock/ETF price ingestion verification: success");
}

function providerConfigs(): InstrumentPriceProviderConfig[] {
  return [
    providerConfig("yahoo_finance", ["AMD", "VOO", "1810.HK"], providerReturning("Yahoo Finance", "USD")),
    providerConfig("eastmoney", ["161128", "159501"], providerReturning("Eastmoney", "CNY")),
    providerConfig("custom", ["FS_US_500"], providerReturning("FundRock", "NZD"))
  ];
}

function providerConfig(
  priceSource: InstrumentPriceProviderConfig["priceSource"],
  sourceSymbols: string[],
  provider: IInstrumentPriceProvider
): InstrumentPriceProviderConfig {
  return { priceSource, sourceSymbols, provider };
}

function providerReturning(providerName: string, fallbackCurrency: "USD" | "HKD" | "CNY" | "NZD"): IInstrumentPriceProvider {
  return providerReturningDate(providerName, fallbackCurrency, "2026-05-20");
}

function providerReturningDate(
  providerName: string,
  fallbackCurrency: "USD" | "HKD" | "CNY" | "NZD",
  priceDate: string
): IInstrumentPriceProvider {
  return {
    name: providerName,
    async fetchLatestPrices(input) {
      return {
        provider: providerName,
        fetchedAt: input.fetchedAt,
        prices: input.instruments.map((instrument, index) => ({
          sourceSymbol: instrument.sourceSymbol,
          priceDate,
          closePrice: (index + 1).toString(),
          currency: instrument.currency ?? fallbackCurrency
        }))
      };
    }
  };
}

function providerFailing(providerName: string): IInstrumentPriceProvider {
  return {
    name: providerName,
    async fetchLatestPrices() {
      throw new Error(`mock ${providerName} failure`);
    }
  };
}

function priceEnabledInstruments(priceSource: InstrumentPriceProviderConfig["priceSource"]): PriceEnabledInstrument[] {
  const instruments: PriceEnabledInstrument[] = [
    priceEnabledInstrument("instrument-amd", "Advanced Micro Devices, Inc.", "USD", "yahoo_finance", "AMD", "NASDAQ"),
    priceEnabledInstrument("instrument-voo", "Vanguard S&P 500 ETF", "USD", "yahoo_finance", "VOO", "NYSE_ARCA"),
    priceEnabledInstrument("instrument-1810", "Xiaomi Corporation", "HKD", "yahoo_finance", "1810.HK", "HKEX"),
    priceEnabledInstrument("instrument-161128", "E Fund S&P IT", "CNY", "eastmoney", "161128", "SZSE"),
    priceEnabledInstrument("instrument-159501", "Harvest Nasdaq 100 ETF", "CNY", "eastmoney", "159501", "SZSE"),
    priceEnabledInstrument("instrument-fs-us-500", "Foundation Series US 500 Fund", "NZD", "custom", "FS_US_500", "INVESTNOW")
  ];

  return instruments.filter((instrument) => instrument.priceSource === priceSource);
}

function priceEnabledInstrument(
  id: string,
  name: string,
  currency: PriceEnabledInstrument["currency"],
  priceSource: InstrumentPriceProviderConfig["priceSource"],
  priceSourceSymbol: string,
  priceSourceExchange: string
): PriceEnabledInstrument {
  return {
    id,
    name,
    currency,
    priceSource,
    priceSourceSymbol,
    exchange: priceSourceExchange,
    priceSourceExchange
  };
}

function fixedNow(): () => Date {
  return () => new Date("2026-05-23T01:30:00.000Z");
}

function createFakeJobRunRepository(calls: string[]) {
  const jobRun = jobRunRecord("job-run-id");
  let providerRunSequence = 0;

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
      providerRunSequence += 1;
      calls.push(`provider:start:${input.provider}:${input.dataKind}:${input.providerStartedAt}`);
      return providerRunRecord(`provider-run-${providerRunSequence}`, input.jobRunId, input.provider, input.dataKind);
    },
    async finishDataProviderRun(
      id: string,
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
        ...providerRunRecord(id, jobRun.id, "provider", "instrument_prices"),
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
    id: `${input.instrumentId}-${input.provider}-${input.priceDate}`,
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
    jobName: UPDATE_PRICES_JOB_NAME,
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

function providerRunRecord(id: string, jobRunId: string, provider: string, dataKind: DataKind): DataProviderRun {
  return {
    id,
    jobRunId,
    provider,
    dataKind,
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

function instrumentPriceIngestionResult(): InstrumentPriceIngestionResult {
  const jobRun = {
    ...jobRunRecord("handler-job-run-id"),
    status: "succeeded" as const,
    jobFinishedAt: "2026-05-23T01:30:00.000Z",
    recordsInserted: 6,
    recordsSkipped: 0
  };

  return {
    jobRun,
    providerRuns: [],
    providerFailures: [],
    fetchedAt: "2026-05-23T01:00:00.000Z",
    recordsInserted: 6,
    recordsSkipped: 0,
    recordsSkippedByClosePolicy: 0,
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

async function withMutedConsole<T>(action: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    return await action();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
