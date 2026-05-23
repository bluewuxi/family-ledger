import type {
  CreateInstrumentPriceInput,
  CurrencyCode,
  DataKind,
  DataProviderRun,
  InstrumentPriceRecord,
  JobRun
} from "@family-ledger/shared";
import { FundRockPieUnitPriceProvider } from "../providers/FundRockPieUnitPriceProvider";
import type { IInstrumentPriceProvider, InstrumentPriceProviderInstrument } from "../providers/IInstrumentPriceProvider";
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

export const FUNDROCK_PROVIDER_NAME = "FundRock";
export const FUNDROCK_PRICE_JOB_NAME = "update-prices";
const INSTRUMENT_PRICE_DATA_KIND: DataKind = "instrument_prices";

export const FUNDROCK_FOUNDATION_SERIES_FUNDS: Record<string, string> = {
  FS_NASDAQ_100: "Foundation Series Nasdaq-100 Fund",
  FS_TOTAL_WORLD: "Foundation Series Total World Fund",
  FS_US_500: "Foundation Series US 500 Fund"
};

interface InstrumentPriceRepository {
  listPriceEnabledInstrumentsBySource(input: {
    priceSource: "custom";
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

export interface FundRockPriceIngestionResult {
  jobRun: JobRun;
  dataProviderRun: DataProviderRun;
  fetchedAt: string;
  provider: string;
  recordsInserted: number;
  recordsSkipped: number;
  instrumentPrices: InstrumentPriceRecord[];
}

export interface IngestLatestFundRockPieUnitPricesOptions {
  fetchedAt?: string;
  now?: () => Date;
  provider?: IInstrumentPriceProvider;
  instrumentPriceRepository?: InstrumentPriceRepository;
  jobRunRepository?: JobRunRepository;
}

export async function ingestLatestFundRockPieUnitPrices(
  options: IngestLatestFundRockPieUnitPricesOptions = {}
): Promise<FundRockPriceIngestionResult> {
  const now = options.now ?? (() => new Date());
  const fetchedAt = options.fetchedAt ?? now().toISOString();
  const provider = options.provider ?? new FundRockPieUnitPriceProvider();
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
    jobName: FUNDROCK_PRICE_JOB_NAME,
    jobStartedAt: fetchedAt
  });
  const dataProviderRun = await jobRunRepository.createDataProviderRun({
    jobRunId: jobRun.id,
    provider: provider.name,
    dataKind: INSTRUMENT_PRICE_DATA_KIND,
    providerStartedAt: fetchedAt
  });

  try {
    const instruments = await instrumentPriceRepository.listPriceEnabledInstrumentsBySource({
      priceSource: "custom",
      sourceSymbols: Object.keys(FUNDROCK_FOUNDATION_SERIES_FUNDS)
    });
    const providerInstruments = toProviderInstruments(instruments);
    const providerResult = await provider.fetchLatestPrices({
      instruments: providerInstruments,
      fetchedAt
    });
    const inputs = toInstrumentPriceInputs(instruments, providerResult.prices, provider.name, providerResult.fetchedAt);
    const instrumentPrices: InstrumentPriceRecord[] = [];
    let recordsInserted = 0;
    let recordsSkipped = 0;

    for (const input of inputs) {
      const result = await instrumentPriceRepository.insertInstrumentPriceIfNotExists(input);
      instrumentPrices.push(result.record);

      if (result.inserted) {
        recordsInserted += 1;
      } else {
        recordsSkipped += 1;
      }
    }

    const finishedAt = now().toISOString();
    const finishedProviderRun = await jobRunRepository.finishDataProviderRun(dataProviderRun.id, {
      status: "succeeded",
      finishedAt,
      recordsInserted,
      recordsSkipped
    });
    const finishedJobRun = await jobRunRepository.finishJobRun(jobRun.id, {
      status: "succeeded",
      finishedAt,
      recordsInserted,
      recordsSkipped
    });

    return {
      jobRun: finishedJobRun,
      dataProviderRun: finishedProviderRun,
      fetchedAt: providerResult.fetchedAt,
      provider: provider.name,
      recordsInserted,
      recordsSkipped,
      instrumentPrices
    };
  } catch (error) {
    const finishedAt = now().toISOString();
    const errorMessage = sanitizeErrorMessage(error);
    await markRunFailedBestEffort({
      jobRunRepository,
      jobRunId: jobRun.id,
      dataProviderRunId: dataProviderRun.id,
      finishedAt,
      errorMessage
    });
    throw error;
  }
}

export function toProviderInstruments(instruments: PriceEnabledInstrument[]): InstrumentPriceProviderInstrument[] {
  const instrumentsBySourceSymbol = new Map(instruments.map((instrument) => [instrument.priceSourceSymbol, instrument]));

  return Object.entries(FUNDROCK_FOUNDATION_SERIES_FUNDS).map(([sourceSymbol, providerInstrumentName]) => {
    const instrument = instrumentsBySourceSymbol.get(sourceSymbol);

    if (!instrument) {
      throw new Error(`FundRock price-enabled instrument is missing for ${sourceSymbol}.`);
    }

    if (instrument.currency !== "NZD") {
      throw new Error(`FundRock instrument ${sourceSymbol} must use NZD currency.`);
    }

    return {
      sourceSymbol,
      providerInstrumentName,
      currency: instrument.currency
    };
  });
}

export function toInstrumentPriceInputs(
  instruments: PriceEnabledInstrument[],
  providerPrices: Array<{ sourceSymbol: string; priceDate: string; closePrice: string; currency: CurrencyCode }>,
  provider: string,
  fetchedAt: string
): CreateInstrumentPriceInput[] {
  const instrumentsBySourceSymbol = new Map(instruments.map((instrument) => [instrument.priceSourceSymbol, instrument]));

  return providerPrices.map((price) => {
    const instrument = instrumentsBySourceSymbol.get(price.sourceSymbol);

    if (!instrument) {
      throw new Error(`FundRock provider returned an unknown source symbol ${price.sourceSymbol}.`);
    }

    if (price.currency !== "NZD") {
      throw new Error(`FundRock provider returned non-NZD currency for ${price.sourceSymbol}.`);
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

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown FundRock price ingestion error.";
}

async function markRunFailedBestEffort(input: {
  jobRunRepository: JobRunRepository;
  jobRunId: string;
  dataProviderRunId: string;
  finishedAt: string;
  errorMessage: string;
}): Promise<void> {
  try {
    await input.jobRunRepository.finishDataProviderRun(input.dataProviderRunId, {
      status: "failed",
      finishedAt: input.finishedAt,
      errorMessage: input.errorMessage
    });
  } catch (failureMarkingError) {
    console.error("Failed to mark FundRock data provider run as failed.", {
      dataProviderRunId: input.dataProviderRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
  }

  try {
    await input.jobRunRepository.finishJobRun(input.jobRunId, {
      status: "failed",
      finishedAt: input.finishedAt,
      errorMessage: input.errorMessage
    });
  } catch (failureMarkingError) {
    console.error("Failed to mark FundRock price job run as failed.", {
      jobRunId: input.jobRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
  }
}
