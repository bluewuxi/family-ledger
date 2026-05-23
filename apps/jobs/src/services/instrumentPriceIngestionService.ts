import type {
  CreateInstrumentPriceInput,
  DataKind,
  DataProviderRun,
  InstrumentPriceRecord,
  JobRun,
  PriceSource
} from "@family-ledger/shared";
import { EastMoneyInstrumentPriceProvider } from "../providers/EastMoneyInstrumentPriceProvider";
import { FundRockPieUnitPriceProvider } from "../providers/FundRockPieUnitPriceProvider";
import type {
  IInstrumentPriceProvider,
  InstrumentPriceProviderInstrument,
  InstrumentPriceProviderPrice
} from "../providers/IInstrumentPriceProvider";
import { YahooFinanceInstrumentPriceProvider } from "../providers/YahooFinanceInstrumentPriceProvider";
import {
  insertInstrumentPriceIfNotExists as defaultInsertInstrumentPriceIfNotExists,
  listPriceEnabledInstrumentsBySource as defaultListPriceEnabledInstrumentsBySource,
  type InsertInstrumentPriceResult,
  type PriceEnabledInstrument
} from "../repositories/instrumentPriceRepository";
import {
  createDataProviderRun as defaultCreateDataProviderRun,
  createJobRun as defaultCreateJobRun,
  finishDataProviderRun as defaultFinishDataProviderRun,
  finishJobRun as defaultFinishJobRun
} from "../repositories/jobRunRepository";
import { FUNDROCK_FOUNDATION_SERIES_FUNDS } from "./fundRockPriceIngestionService";

export const UPDATE_PRICES_JOB_NAME = "update-prices";
export const YAHOO_FINANCE_PROVIDER_NAME = "Yahoo Finance";
export const EASTMONEY_PROVIDER_NAME = "Eastmoney";

const INSTRUMENT_PRICE_DATA_KIND: DataKind = "instrument_prices";
const YAHOO_FINANCE_SEEDED_SYMBOLS = ["AMD", "QQQM", "VGT", "SMH", "1810.HK", "0700.HK"] as const;
const EASTMONEY_SEEDED_SYMBOLS = ["161128", "159501", "513500"] as const;

interface InstrumentPriceRepository {
  listPriceEnabledInstrumentsBySource(input: {
    priceSource: PriceSource;
    sourceSymbols: string[];
  }): Promise<PriceEnabledInstrument[]>;
  insertInstrumentPriceIfNotExists(input: CreateInstrumentPriceInput): Promise<InsertInstrumentPriceResult>;
}

interface JobRunRepository {
  createJobRun(input: { jobName: string; jobStartedAt: string }): Promise<JobRun>;
  finishJobRun(
    id: string,
    input: {
      status: "succeeded" | "failed";
      finishedAt: string;
      recordsInserted?: number;
      recordsSkipped?: number;
      errorMessage?: string | null;
    }
  ): Promise<JobRun>;
  createDataProviderRun(input: {
    jobRunId: string;
    provider: string;
    dataKind: DataKind;
    providerStartedAt: string;
  }): Promise<DataProviderRun>;
  finishDataProviderRun(
    id: string,
    input: {
      status: "succeeded" | "failed";
      finishedAt: string;
      recordsInserted?: number;
      recordsSkipped?: number;
      errorMessage?: string | null;
    }
  ): Promise<DataProviderRun>;
}

export interface InstrumentPriceProviderConfig {
  priceSource: PriceSource;
  sourceSymbols: string[];
  provider: IInstrumentPriceProvider;
  providerInstrumentNames?: Record<string, string>;
}

export interface InstrumentPriceProviderRunResult {
  provider: string;
  priceSource: PriceSource;
  dataProviderRun: DataProviderRun;
  fetchedAt: string;
  recordsInserted: number;
  recordsSkipped: number;
  instrumentPrices: InstrumentPriceRecord[];
}

export interface InstrumentPriceProviderRunFailure {
  provider: string;
  priceSource: PriceSource;
  dataProviderRun: DataProviderRun | null;
  errorMessage: string;
}

export interface InstrumentPriceIngestionResult {
  jobRun: JobRun;
  providerRuns: InstrumentPriceProviderRunResult[];
  providerFailures: InstrumentPriceProviderRunFailure[];
  fetchedAt: string;
  recordsInserted: number;
  recordsSkipped: number;
  instrumentPrices: InstrumentPriceRecord[];
}

export interface IngestLatestInstrumentPricesOptions {
  fetchedAt?: string;
  now?: () => Date;
  providerConfigs?: InstrumentPriceProviderConfig[];
  instrumentPriceRepository?: InstrumentPriceRepository;
  jobRunRepository?: JobRunRepository;
}

export async function ingestLatestInstrumentPrices(
  options: IngestLatestInstrumentPricesOptions = {}
): Promise<InstrumentPriceIngestionResult> {
  const now = options.now ?? (() => new Date());
  const fetchedAt = options.fetchedAt ?? now().toISOString();
  const providerConfigs = options.providerConfigs ?? defaultInstrumentPriceProviderConfigs();
  const instrumentPriceRepository = options.instrumentPriceRepository ?? {
    listPriceEnabledInstrumentsBySource: defaultListPriceEnabledInstrumentsBySource,
    insertInstrumentPriceIfNotExists: defaultInsertInstrumentPriceIfNotExists
  };
  const jobRunRepository = options.jobRunRepository ?? {
    createJobRun: defaultCreateJobRun,
    finishJobRun: defaultFinishJobRun,
    createDataProviderRun: defaultCreateDataProviderRun,
    finishDataProviderRun: defaultFinishDataProviderRun
  };

  const jobRun = await jobRunRepository.createJobRun({
    jobName: UPDATE_PRICES_JOB_NAME,
    jobStartedAt: fetchedAt
  });
  const providerRuns: InstrumentPriceProviderRunResult[] = [];
  const providerFailures: InstrumentPriceProviderRunFailure[] = [];
  const instrumentPrices: InstrumentPriceRecord[] = [];
  let recordsInserted = 0;
  let recordsSkipped = 0;

  for (const providerConfig of providerConfigs) {
    const runResult = await runProvider({
      providerConfig,
      jobRunId: jobRun.id,
      fetchedAt,
      now,
      instrumentPriceRepository,
      jobRunRepository
    });

    if (runResult.status === "succeeded") {
      providerRuns.push(runResult.result);
      instrumentPrices.push(...runResult.result.instrumentPrices);
      recordsInserted += runResult.result.recordsInserted;
      recordsSkipped += runResult.result.recordsSkipped;
    } else {
      providerFailures.push(runResult.failure);
    }
  }

  const finishedAt = now().toISOString();
  const finalStatus = providerFailures.length === 0 ? "succeeded" : "failed";
  const errorMessage = providerFailures.length === 0 ? null : summarizeProviderFailures(providerFailures);
  const finishedJobRun = await jobRunRepository.finishJobRun(jobRun.id, {
    status: finalStatus,
    finishedAt,
    recordsInserted,
    recordsSkipped,
    errorMessage
  });
  const result: InstrumentPriceIngestionResult = {
    jobRun: finishedJobRun,
    providerRuns,
    providerFailures,
    fetchedAt,
    recordsInserted,
    recordsSkipped,
    instrumentPrices
  };

  if (providerFailures.length > 0) {
    throw new InstrumentPriceIngestionError(errorMessage ?? "Instrument price ingestion failed.", result);
  }

  return result;
}

export function defaultInstrumentPriceProviderConfigs(): InstrumentPriceProviderConfig[] {
  return [
    {
      priceSource: "yahoo_finance",
      sourceSymbols: [...YAHOO_FINANCE_SEEDED_SYMBOLS],
      provider: new YahooFinanceInstrumentPriceProvider()
    },
    {
      priceSource: "eastmoney",
      sourceSymbols: [...EASTMONEY_SEEDED_SYMBOLS],
      provider: new EastMoneyInstrumentPriceProvider()
    },
    {
      priceSource: "custom",
      sourceSymbols: Object.keys(FUNDROCK_FOUNDATION_SERIES_FUNDS),
      provider: new FundRockPieUnitPriceProvider(),
      providerInstrumentNames: FUNDROCK_FOUNDATION_SERIES_FUNDS
    }
  ];
}

export function toProviderInstruments(
  instruments: PriceEnabledInstrument[],
  providerInstrumentNames: Record<string, string> = {}
): InstrumentPriceProviderInstrument[] {
  return instruments.map((instrument) => ({
    sourceSymbol: instrument.priceSourceSymbol,
    providerInstrumentName: providerInstrumentNames[instrument.priceSourceSymbol] ?? instrument.name,
    currency: instrument.currency,
    sourceExchange: instrument.priceSourceExchange
  }));
}

export function toInstrumentPriceInputs(
  instruments: PriceEnabledInstrument[],
  providerPrices: InstrumentPriceProviderPrice[],
  provider: string,
  fetchedAt: string
): CreateInstrumentPriceInput[] {
  const instrumentsBySourceSymbol = new Map(instruments.map((instrument) => [instrument.priceSourceSymbol, instrument]));
  const returnedSourceSymbols = new Set(providerPrices.map((price) => price.sourceSymbol));
  const missingSourceSymbols = instruments
    .map((instrument) => instrument.priceSourceSymbol)
    .filter((sourceSymbol) => !returnedSourceSymbols.has(sourceSymbol));

  if (missingSourceSymbols.length > 0) {
    throw new Error(`${provider} did not return prices for ${missingSourceSymbols.join(", ")}.`);
  }

  return providerPrices.map((price) => {
    const instrument = instrumentsBySourceSymbol.get(price.sourceSymbol);

    if (!instrument) {
      throw new Error(`${provider} returned an unknown source symbol ${price.sourceSymbol}.`);
    }

    if (price.currency !== instrument.currency) {
      throw new Error(`${provider} returned ${price.currency} currency for ${price.sourceSymbol}; expected ${instrument.currency}.`);
    }

    return {
      instrumentId: instrument.id,
      priceDate: price.priceDate,
      closePrice: price.closePrice,
      currency: price.currency,
      provider,
      sourceSymbol: price.sourceSymbol,
      isAdjusted: false,
      fetchedAt
    };
  });
}

class InstrumentPriceIngestionError extends Error {
  readonly result: InstrumentPriceIngestionResult;

  constructor(message: string, result: InstrumentPriceIngestionResult) {
    super(message);
    this.name = "InstrumentPriceIngestionError";
    this.result = result;
  }
}

type ProviderRunOutcome =
  | { status: "succeeded"; result: InstrumentPriceProviderRunResult }
  | { status: "failed"; failure: InstrumentPriceProviderRunFailure };

async function runProvider(input: {
  providerConfig: InstrumentPriceProviderConfig;
  jobRunId: string;
  fetchedAt: string;
  now: () => Date;
  instrumentPriceRepository: InstrumentPriceRepository;
  jobRunRepository: JobRunRepository;
}): Promise<ProviderRunOutcome> {
  const { providerConfig, fetchedAt, now, instrumentPriceRepository, jobRunRepository } = input;
  let dataProviderRun: DataProviderRun | null = null;

  try {
    dataProviderRun = await jobRunRepository.createDataProviderRun({
      jobRunId: input.jobRunId,
      provider: providerConfig.provider.name,
      dataKind: INSTRUMENT_PRICE_DATA_KIND,
      providerStartedAt: fetchedAt
    });
    const instruments = await instrumentPriceRepository.listPriceEnabledInstrumentsBySource({
      priceSource: providerConfig.priceSource,
      sourceSymbols: providerConfig.sourceSymbols
    });
    const providerResult = await providerConfig.provider.fetchLatestPrices({
      instruments: toProviderInstruments(instruments, providerConfig.providerInstrumentNames),
      fetchedAt
    });
    const priceInputs = toInstrumentPriceInputs(
      instruments,
      providerResult.prices,
      providerConfig.provider.name,
      providerResult.fetchedAt
    );
    const instrumentPrices: InstrumentPriceRecord[] = [];
    let recordsInserted = 0;
    let recordsSkipped = 0;

    for (const priceInput of priceInputs) {
      const insertResult = await instrumentPriceRepository.insertInstrumentPriceIfNotExists(priceInput);
      instrumentPrices.push(insertResult.record);

      if (insertResult.inserted) {
        recordsInserted += 1;
      } else {
        recordsSkipped += 1;
      }
    }

    const finishedProviderRun = await jobRunRepository.finishDataProviderRun(dataProviderRun.id, {
      status: "succeeded",
      finishedAt: now().toISOString(),
      recordsInserted,
      recordsSkipped
    });

    return {
      status: "succeeded",
      result: {
        provider: providerConfig.provider.name,
        priceSource: providerConfig.priceSource,
        dataProviderRun: finishedProviderRun,
        fetchedAt: providerResult.fetchedAt,
        recordsInserted,
        recordsSkipped,
        instrumentPrices
      }
    };
  } catch (error) {
    const errorMessage = sanitizeErrorMessage(error);
    const failedProviderRun =
      dataProviderRun === null
        ? null
        : await markProviderRunFailedBestEffort({
            jobRunRepository,
            dataProviderRunId: dataProviderRun.id,
            finishedAt: now().toISOString(),
            errorMessage
          });

    return {
      status: "failed",
      failure: {
        provider: providerConfig.provider.name,
        priceSource: providerConfig.priceSource,
        dataProviderRun: failedProviderRun,
        errorMessage
      }
    };
  }
}

function summarizeProviderFailures(failures: InstrumentPriceProviderRunFailure[]): string {
  return failures.map((failure) => `${failure.provider}: ${failure.errorMessage}`).join("; ").slice(0, 500);
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown instrument price ingestion error.";
}

async function markProviderRunFailedBestEffort(input: {
  jobRunRepository: JobRunRepository;
  dataProviderRunId: string;
  finishedAt: string;
  errorMessage: string;
}): Promise<DataProviderRun | null> {
  try {
    return await input.jobRunRepository.finishDataProviderRun(input.dataProviderRunId, {
      status: "failed",
      finishedAt: input.finishedAt,
      errorMessage: input.errorMessage
    });
  } catch (failureMarkingError) {
    console.error("Failed to mark instrument price data provider run as failed.", {
      dataProviderRunId: input.dataProviderRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
    return null;
  }
}
