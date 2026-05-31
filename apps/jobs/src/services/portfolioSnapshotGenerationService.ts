import {
  calculateHoldings,
  calculatePortfolioSnapshotValuation,
  type ExchangeRateRecord,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type JobRun,
  type PortfolioSnapshotValuation,
  type PriceRecord
} from "@family-ledger/shared";
import {
  createJobRun as defaultCreateJobRun,
  finishJobRun as defaultFinishJobRun
} from "../repositories/jobRunRepository";
import {
  listSnapshotAccounts as defaultListSnapshotAccounts,
  listSnapshotExchangeRates as defaultListSnapshotExchangeRates,
  listSnapshotInstruments as defaultListSnapshotInstruments,
  listSnapshotPrices as defaultListSnapshotPrices,
  listSnapshotTransactions as defaultListSnapshotTransactions,
  upsertPortfolioSnapshot as defaultUpsertPortfolioSnapshot,
  type UpsertPortfolioSnapshotResult
} from "../repositories/portfolioSnapshotRepository";

export const GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME = "generate-portfolio-snapshots";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

interface SnapshotRepository {
  listSnapshotAccounts(): Promise<InvestmentAccount[]>;
  listSnapshotInstruments(): Promise<Instrument[]>;
  listSnapshotTransactions(snapshotDate: string): Promise<InvestmentTransaction[]>;
  listSnapshotPrices(snapshotDate: string, instrumentIds?: string[]): Promise<PriceRecord[]>;
  listSnapshotExchangeRates(
    snapshotDate: string,
    transactionDates?: string[],
    fromCurrencies?: ExchangeRateRecord["fromCurrency"][]
  ): Promise<ExchangeRateRecord[]>;
  upsertPortfolioSnapshot(valuation: PortfolioSnapshotValuation): Promise<UpsertPortfolioSnapshotResult>;
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
}

export interface GeneratePortfolioSnapshotOptions {
  snapshotDate: string;
  startedAt?: string;
  now?: () => Date;
  snapshotRepository?: SnapshotRepository;
  jobRunRepository?: JobRunRepository;
}

export interface GeneratePortfolioSnapshotResult {
  jobRun: JobRun;
  snapshotId: string;
  snapshotDate: string;
  accountsWritten: number;
  valuation: PortfolioSnapshotValuation;
}

export async function generatePortfolioSnapshot(
  options: GeneratePortfolioSnapshotOptions
): Promise<GeneratePortfolioSnapshotResult> {
  validateSnapshotDate(options.snapshotDate);

  const now = options.now ?? (() => new Date());
  const startedAt = options.startedAt ?? now().toISOString();
  const snapshotRepository = options.snapshotRepository ?? defaultSnapshotRepository();
  const jobRunRepository = options.jobRunRepository ?? {
    createJobRun: defaultCreateJobRun,
    finishJobRun: defaultFinishJobRun
  };
  const jobRun = await jobRunRepository.createJobRun({
    jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
    jobStartedAt: startedAt
  });

  try {
    const [accounts, instruments, transactions] = await Promise.all([
      snapshotRepository.listSnapshotAccounts(),
      snapshotRepository.listSnapshotInstruments(),
      snapshotRepository.listSnapshotTransactions(options.snapshotDate)
    ]);
    const preliminaryHoldings = calculateHoldings(transactions, accounts, instruments);
    const [prices, fxRates] = await Promise.all([
      snapshotRepository.listSnapshotPrices(options.snapshotDate, getHeldInstrumentIds(preliminaryHoldings)),
      snapshotRepository.listSnapshotExchangeRates(
        options.snapshotDate,
        getSnapshotFxDates(transactions),
        getSnapshotFxCurrencies(transactions, preliminaryHoldings)
      )
    ]);
    const holdings = calculateHoldings(transactions, accounts, instruments, { fxRates });
    const valuation = calculatePortfolioSnapshotValuation({
      snapshotDate: options.snapshotDate,
      holdings,
      accounts,
      prices,
      fxRates
    });
    const upsertResult = await snapshotRepository.upsertPortfolioSnapshot(valuation);
    const finishedJobRun = await jobRunRepository.finishJobRun(jobRun.id, {
      status: "succeeded",
      finishedAt: now().toISOString(),
      recordsInserted: upsertResult.accountsWritten + 1,
      recordsSkipped: 0
    });

    return {
      jobRun: finishedJobRun,
      snapshotId: upsertResult.snapshotId,
      snapshotDate: options.snapshotDate,
      accountsWritten: upsertResult.accountsWritten,
      valuation
    };
  } catch (error) {
    await markJobRunFailedBestEffort(jobRunRepository, jobRun.id, now().toISOString(), sanitizeErrorMessage(error));
    throw error;
  }
}

function defaultSnapshotRepository(): SnapshotRepository {
  return {
    listSnapshotAccounts: defaultListSnapshotAccounts,
    listSnapshotInstruments: defaultListSnapshotInstruments,
    listSnapshotTransactions: defaultListSnapshotTransactions,
    listSnapshotPrices: defaultListSnapshotPrices,
    listSnapshotExchangeRates: defaultListSnapshotExchangeRates,
    upsertPortfolioSnapshot: defaultUpsertPortfolioSnapshot
  };
}

function validateSnapshotDate(snapshotDate: string): void {
  if (!datePattern.test(snapshotDate)) {
    throw new Error("Snapshot date must use YYYY-MM-DD format.");
  }
}

function getHeldInstrumentIds(holdings: ReturnType<typeof calculateHoldings>): string[] {
  return uniqueValues(
    holdings.filter((holding) => holding.assetType !== "cash").map((holding) => holding.instrumentId)
  );
}

function getSnapshotFxDates(transactions: InvestmentTransaction[]): string[] {
  return uniqueValues(
    transactions
      .filter(requiresHistoricalCostBasisRate)
      .map((transaction) => transaction.tradeDate)
  );
}

function getSnapshotFxCurrencies(
  transactions: InvestmentTransaction[],
  holdings: ReturnType<typeof calculateHoldings>
): ExchangeRateRecord["fromCurrency"][] {
  const currencies = new Set<ExchangeRateRecord["fromCurrency"]>(["NZD", "CNY"]);

  for (const holding of holdings) {
    currencies.add(holding.currency);
  }

  for (const transaction of transactions) {
    if (!requiresHistoricalCostBasisRate(transaction)) {
      continue;
    }

    if (transaction.currency !== "USD") {
      currencies.add(transaction.currency);
    }

    if (transaction.settlementCurrency && transaction.settlementCurrency !== "USD") {
      currencies.add(transaction.settlementCurrency);
    }
  }

  return [...currencies];
}

function requiresHistoricalCostBasisRate(transaction: InvestmentTransaction): boolean {
  return (
    (transaction.transactionType === "buy" || transaction.transactionType === "opening_position") &&
    (transaction.currency !== "USD" || (transaction.settlementCurrency !== null && transaction.settlementCurrency !== "USD"))
  );
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown portfolio snapshot generation error.";
}

async function markJobRunFailedBestEffort(
  jobRunRepository: JobRunRepository,
  jobRunId: string,
  finishedAt: string,
  errorMessage: string
): Promise<void> {
  try {
    await jobRunRepository.finishJobRun(jobRunId, {
      status: "failed",
      finishedAt,
      errorMessage
    });
  } catch (failureMarkingError) {
    console.error("Failed to mark portfolio snapshot job run as failed.", {
      jobRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
  }
}
