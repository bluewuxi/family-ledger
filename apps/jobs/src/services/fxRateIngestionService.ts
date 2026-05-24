import Decimal from "decimal.js";
import type {
  CreateExchangeRateInput,
  CurrencyCode,
  DataKind,
  DataProviderRun,
  ExchangeRateRecord,
  JobRun,
  JobTriggerSource
} from "@family-ledger/shared";
import { FrankfurterFxRateProvider } from "../providers/FrankfurterFxRateProvider";
import type { IFxRateProvider } from "../providers/IFxRateProvider";
import {
  insertExchangeRateIfNotExists as defaultInsertExchangeRateIfNotExists,
  type InsertExchangeRateResult
} from "../repositories/exchangeRateRepository";
import { listDistinctAccountBaseCurrencies as defaultListDistinctAccountBaseCurrencies } from "../repositories/accountCurrencyRepository";
import {
  createDataProviderRun as defaultCreateDataProviderRun,
  createJobRun as defaultCreateJobRun,
  finishDataProviderRun as defaultFinishDataProviderRun,
  finishJobRun as defaultFinishJobRun
} from "../repositories/jobRunRepository";

export const DEFAULT_FRANKFURTER_TARGET_CURRENCIES: CurrencyCode[] = ["NZD", "CNY", "HKD"];
export const FRANKFURTER_PROVIDER_NAME = "Frankfurter";
export const FRANKFURTER_FX_JOB_NAME = "ingest-frankfurter-fx-rates";
const FX_DATA_KIND: DataKind = "exchange_rates";

interface ExchangeRateRepository {
  insertExchangeRateIfNotExists(input: CreateExchangeRateInput): Promise<InsertExchangeRateResult>;
}

interface JobRunRepository {
  createJobRun(input: {
    jobName: string;
    jobStartedAt: string;
    triggerSource?: JobTriggerSource;
    triggeredByUserId?: string | null;
    triggerRequestId?: string | null;
  }): Promise<JobRun>;
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

interface AccountCurrencyRepository {
  listDistinctAccountBaseCurrencies(): Promise<CurrencyCode[]>;
}

export interface FxRateIngestionResult {
  jobRun: JobRun;
  dataProviderRun: DataProviderRun;
  rateDate: string;
  fetchedAt: string;
  provider: string;
  recordsInserted: number;
  recordsSkipped: number;
  exchangeRates: ExchangeRateRecord[];
}

export interface IngestLatestFrankfurterFxRatesOptions {
  targetCurrencies?: CurrencyCode[];
  fetchedAt?: string;
  rateDate?: string;
  now?: () => Date;
  triggerSource?: JobTriggerSource;
  triggeredByUserId?: string | null;
  triggerRequestId?: string | null;
  provider?: IFxRateProvider;
  exchangeRateRepository?: ExchangeRateRepository;
  jobRunRepository?: JobRunRepository;
  accountCurrencyRepository?: AccountCurrencyRepository;
}

export async function ingestLatestFrankfurterFxRates(
  options: IngestLatestFrankfurterFxRatesOptions = {}
): Promise<FxRateIngestionResult> {
  const now = options.now ?? (() => new Date());
  const fetchedAt = options.fetchedAt ?? now().toISOString();
  const provider = options.provider ?? new FrankfurterFxRateProvider();
  const exchangeRateRepository = options.exchangeRateRepository ?? {
    insertExchangeRateIfNotExists: defaultInsertExchangeRateIfNotExists
  };
  const accountCurrencyRepository = options.accountCurrencyRepository ?? {
    listDistinctAccountBaseCurrencies: defaultListDistinctAccountBaseCurrencies
  };
  const jobRunRepository = options.jobRunRepository ?? {
    createJobRun: defaultCreateJobRun,
    finishJobRun: defaultFinishJobRun,
    createDataProviderRun: defaultCreateDataProviderRun,
    finishDataProviderRun: defaultFinishDataProviderRun
  };

  const accountCurrencies = options.targetCurrencies ?? (await accountCurrencyRepository.listDistinctAccountBaseCurrencies());
  const targetCurrencies = uniqueCurrencies(accountCurrencies.length > 0 ? accountCurrencies : DEFAULT_FRANKFURTER_TARGET_CURRENCIES).filter(
    (currency) => currency !== "USD"
  );
  const jobRun = await jobRunRepository.createJobRun({
    jobName: FRANKFURTER_FX_JOB_NAME,
    jobStartedAt: fetchedAt,
    triggerSource: options.triggerSource,
    triggeredByUserId: options.triggeredByUserId,
    triggerRequestId: options.triggerRequestId
  });
  const dataProviderRun = await jobRunRepository.createDataProviderRun({
    jobRunId: jobRun.id,
    provider: provider.name,
    dataKind: FX_DATA_KIND,
    providerStartedAt: fetchedAt
  });

  try {
    if (targetCurrencies.length === 0) {
      const finishedAt = now().toISOString();
      const finishedProviderRun = await jobRunRepository.finishDataProviderRun(dataProviderRun.id, {
        status: "succeeded",
        finishedAt,
        recordsInserted: 0,
        recordsSkipped: 0
      });
      const finishedJobRun = await jobRunRepository.finishJobRun(jobRun.id, {
        status: "succeeded",
        finishedAt,
        recordsInserted: 0,
        recordsSkipped: 0
      });

      return {
        jobRun: finishedJobRun,
        dataProviderRun: finishedProviderRun,
        rateDate: options.rateDate ?? fetchedAt.slice(0, 10),
        fetchedAt,
        provider: provider.name,
        recordsInserted: 0,
        recordsSkipped: 0,
        exchangeRates: []
      };
    }

    const providerResult = await provider.fetchLatestRates({
      baseCurrency: "USD",
      targetCurrencies,
      fetchedAt,
      rateDate: options.rateDate
    });
    const inputs = toExchangeRateInputs(providerResult.rateDate, providerResult.fetchedAt, provider.name, providerResult.rates);
    const exchangeRates: ExchangeRateRecord[] = [];
    let recordsInserted = 0;
    let recordsSkipped = 0;

    for (const input of inputs) {
      const result = await exchangeRateRepository.insertExchangeRateIfNotExists(input);
      exchangeRates.push(result.record);

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
      rateDate: providerResult.rateDate,
      fetchedAt: providerResult.fetchedAt,
      provider: provider.name,
      recordsInserted,
      recordsSkipped,
      exchangeRates
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

export function toExchangeRateInputs(
  rateDate: string,
  fetchedAt: string,
  provider: string,
  providerRates: Array<{ currency: CurrencyCode; providerRate: string }>
): CreateExchangeRateInput[] {
  return providerRates.map((rate) => ({
    rateDate,
    fromCurrency: rate.currency,
    toCurrency: "USD" as const,
    rate: new Decimal(1).dividedBy(rate.providerRate).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(10),
    rateType: "valuation" as const,
    provider,
    providerRateDate: rateDate,
    fetchedAt
  }));
}

function uniqueCurrencies(currencies: CurrencyCode[]): CurrencyCode[] {
  return [...new Set(currencies)];
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown FX ingestion error.";
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
    console.error("Failed to mark FX data provider run as failed.", {
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
    console.error("Failed to mark FX job run as failed.", {
      jobRunId: input.jobRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
  }
}
