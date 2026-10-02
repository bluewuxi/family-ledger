import Decimal from "decimal.js";
import {
  MARKET_DATA_SOURCE_DEFINITIONS,
  fetchYahooFinanceDailyBars,
  getKernelValuationDateForNzxSession,
  type AuthenticatedUser,
  type CreateKernelPriceAnchorInput,
  type KernelPriceAnchor,
  type MarketDataSourceKey,
  type MarketDataSourceSummary,
  type MarketDataSourceStatus,
  type YahooFinanceDailyBar
} from "@family-ledger/shared";
import {
  countEnabledPriceTargets,
  findKernelEstimateInstrument,
  findLatestProviderRun,
  listKernelPriceAnchors,
  saveKernelPriceAnchor,
  type KernelEstimateWrite
} from "../repositories/marketDataSourceRepository";
import { ApiRequestError } from "../utils/apiError";
import { recalculateSnapshotsFrom } from "./snapshotRecalculationService";

const KERNEL_PROXY_SYMBOL = "USF.NZ";
const KERNEL_PROXY_TIME_ZONE = "Pacific/Auckland";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function getMarketDataSources(): Promise<MarketDataSourceSummary[]> {
  const anchorsPromise = listKernelPriceAnchors();
  return Promise.all(
    MARKET_DATA_SOURCE_DEFINITIONS.map(async (definition): Promise<MarketDataSourceSummary> => {
      const [latestBatchRun, configuredTargetCount, anchors] = await Promise.all([
        findLatestProviderRun(definition.runProviderName),
        definition.priceSource
          ? countEnabledPriceTargets(definition.priceSource, definition.sourceSymbols)
          : Promise.resolve(null),
        definition.key === "kernel_estimate" ? anchorsPromise : Promise.resolve([])
      ]);
      const latestAnchorDate = anchors[0]?.anchorDate ?? null;
      const status = resolveMarketDataSourceStatus(definition.key, configuredTargetCount, anchors.length);

      return {
        key: definition.key,
        name: definition.name,
        capabilities: definition.capabilities,
        acquisitionMethod: definition.acquisitionMethod,
        configurationType: definition.configurationType,
        status,
        configuredTargetCount,
        latestBatchRun,
        latestAnchorDate
      };
    })
  );
}

export async function getKernelPriceAnchors(): Promise<KernelPriceAnchor[]> {
  return listKernelPriceAnchors();
}

export function resolveMarketDataSourceStatus(
  sourceKey: MarketDataSourceKey,
  configuredTargetCount: number | null,
  anchorCount: number
): MarketDataSourceStatus {
  if (sourceKey === "kernel_estimate" && anchorCount === 0) return "needs_configuration";
  return configuredTargetCount === null || configuredTargetCount > 0 ? "ready" : "inactive";
}

export async function createKernelPriceAnchor(
  body: unknown,
  user: AuthenticatedUser,
  now: () => Date = () => new Date()
): Promise<KernelPriceAnchor> {
  const input = parseCreateInput(body);
  const instrument = await findKernelEstimateInstrument();
  if (!instrument) throw new ApiRequestError("INTERNAL_ERROR", "Kernel estimate instrument is not configured.", 500);

  const fetchedAt = now().toISOString();
  let bars: YahooFinanceDailyBar[];
  try {
    const result = await fetchYahooFinanceDailyBars({
      sourceSymbol: KERNEL_PROXY_SYMBOL,
      expectedCurrency: "NZD",
      expectedExchangeTimeZone: KERNEL_PROXY_TIME_ZONE,
      fetchedAt,
      fromDate: input.anchorDate,
      requiredPriceField: "open",
      confirmationCutoff: { timeZone: KERNEL_PROXY_TIME_ZONE, hour: 10, minute: 5 }
    });
    bars = result.bars;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no confirmed daily open")) {
      throw new ApiRequestError(
        "DATA_SOURCE_DATE_UNAVAILABLE",
        "No confirmed next-session USF.NZ opening price is available after the selected Kernel valuation date.",
        422
      );
    }
    throw new ApiRequestError("DATA_SOURCE_UNAVAILABLE", "USF.NZ market data is currently unavailable.", 502);
  }

  const anchorBar = bars.find((bar) => bar.priceDate > input.anchorDate);
  if (!anchorBar || getKernelValuationDateForNzxSession(anchorBar.priceDate) !== input.anchorDate) {
    throw new ApiRequestError(
      "DATA_SOURCE_DATE_UNAVAILABLE",
      "No confirmed next-session USF.NZ opening price is available after the selected Kernel valuation date.",
      422
    );
  }
  if (!anchorBar.openPrice) {
    throw new ApiRequestError("DATA_SOURCE_UNAVAILABLE", "USF.NZ opening-price data is currently unavailable.", 502);
  }

  const existingAnchors = await listKernelPriceAnchors();
  const candidate: KernelPriceAnchor = {
    id: "candidate",
    instrumentId: instrument.id,
    anchorDate: input.anchorDate,
    kernelUnitPrice: input.kernelUnitPrice,
    proxySymbol: KERNEL_PROXY_SYMBOL,
    proxyCurrency: "NZD",
    proxyClose: anchorBar.openPrice,
    proxyPriceDate: anchorBar.priceDate,
    proxyFetchedAt: fetchedAt,
    createdByUserId: user.id,
    createdAt: fetchedAt
  };
  const estimates = calculateKernelEstimates(bars, [candidate, ...existingAnchors], fetchedAt);
  const saved = await saveKernelPriceAnchor({
    instrumentId: instrument.id,
    anchorDate: input.anchorDate,
    kernelUnitPrice: input.kernelUnitPrice,
    proxySymbol: KERNEL_PROXY_SYMBOL,
    proxyCurrency: "NZD",
    proxyClose: anchorBar.openPrice,
    proxyPriceDate: anchorBar.priceDate,
    proxyFetchedAt: fetchedAt,
    createdByUserId: user.id,
    estimates
  });
  await recalculateSnapshotsFrom(input.anchorDate);
  return saved;
}

export function calculateKernelEstimates(
  bars: YahooFinanceDailyBar[],
  anchors: KernelPriceAnchor[],
  fetchedAt: string
): KernelEstimateWrite[] {
  const exactDates = new Set(anchors.map((anchor) => anchor.anchorDate));
  const orderedAnchors = [...anchors].sort(
    (left, right) => right.proxyPriceDate.localeCompare(left.proxyPriceDate)
      || right.anchorDate.localeCompare(left.anchorDate)
      || right.createdAt.localeCompare(left.createdAt)
  );

  return bars.flatMap((bar) => {
    const valuationDate = getKernelValuationDateForNzxSession(bar.priceDate);
    if (exactDates.has(valuationDate)) return [];
    const anchor = orderedAnchors.find((candidate) =>
      candidate.anchorDate <= valuationDate && candidate.proxyPriceDate <= bar.priceDate
    );
    if (!anchor) return [];
    if (!bar.openPrice) throw new Error("Yahoo Finance returned a confirmed USF.NZ bar without an opening price.");
    const result = new Decimal(anchor.kernelUnitPrice)
      .times(bar.openPrice)
      .dividedBy(anchor.proxyClose)
      .toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
    if (!result.isFinite() || result.lte(0)) throw new Error("Kernel estimate calculation produced an invalid price.");
    return [{ priceDate: valuationDate, closePrice: result.toFixed(10), fetchedAt }];
  });
}

function parseCreateInput(body: unknown): CreateKernelPriceAnchorInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be an object.", 400);
  }
  const anchorDate = (body as { anchorDate?: unknown }).anchorDate;
  const kernelUnitPrice = (body as { kernelUnitPrice?: unknown }).kernelUnitPrice;
  const parsedDate = typeof anchorDate === "string" ? new Date(`${anchorDate}T00:00:00Z`) : null;
  if (
    typeof anchorDate !== "string"
    || !datePattern.test(anchorDate)
    || !parsedDate
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== anchorDate
  ) {
    throw new ApiRequestError("VALIDATION_ERROR", "anchorDate must use YYYY-MM-DD format.", 400);
  }
  if (typeof kernelUnitPrice !== "string" || !/^\d+(?:\.\d{1,10})?$/.test(kernelUnitPrice)) {
    throw new ApiRequestError("VALIDATION_ERROR", "kernelUnitPrice must be a positive decimal with at most 10 decimal places.", 400);
  }
  const price = new Decimal(kernelUnitPrice);
  if (!price.isFinite() || price.lte(0)) {
    throw new ApiRequestError("VALIDATION_ERROR", "kernelUnitPrice must be positive.", 400);
  }
  return { anchorDate, kernelUnitPrice: price.toString() };
}
