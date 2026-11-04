import Decimal from "decimal.js";
import {
  MARKET_DATA_SOURCE_DEFINITIONS,
  type AuthenticatedUser,
  type CreateKernelPriceAnchorInput,
  type KernelPriceAnchor,
  type MarketDataSourceKey,
  type MarketDataSourceSummary,
  type MarketDataSourceStatus,
} from "@family-ledger/shared";
import {
  countEnabledPriceTargets,
  findKernelEstimateInstrument,
  findLatestProviderRun,
  listKernelPriceAnchors,
  saveKernelActualAnchor,
  completeKernelNtaSnapshots,
  listPriceGapSummaries,
} from "../repositories/marketDataSourceRepository";
import { ApiRequestError } from "../utils/apiError";
import { recalculateSnapshotsFrom } from "./snapshotRecalculationService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function getMarketDataSources(): Promise<MarketDataSourceSummary[]> {
  const anchorsPromise = listKernelPriceAnchors();
  const recoveryPromise = listPriceGapSummaries();
  return Promise.all(
    MARKET_DATA_SOURCE_DEFINITIONS.map(async (definition): Promise<MarketDataSourceSummary> => {
      const [latestBatchRun, configuredTargetCount, anchors, recoveryRows] = await Promise.all([
        findLatestProviderRun(definition.runProviderName),
        definition.priceSource
          ? countEnabledPriceTargets(definition.priceSource, definition.sourceSymbols)
          : Promise.resolve(null),
        definition.key === "kernel_estimate" ? anchorsPromise : Promise.resolve([]),
        recoveryPromise
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
        latestAnchorDate,
        recovery: recoveryRows.find(row => row.source === definition.key) ?? { pending: 0, needsAttention: 0, unsupported: 0, oldestMissingDate: null, nextAttemptAt: null }
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

export interface KernelAnchorSaveDependencies {
  findInstrument: typeof findKernelEstimateInstrument;
  save: typeof saveKernelActualAnchor;
  recalculate: typeof recalculateSnapshotsFrom;
  complete: typeof completeKernelNtaSnapshots;
}
const kernelAnchorSaveDependencies: KernelAnchorSaveDependencies = {
  findInstrument: findKernelEstimateInstrument, save: saveKernelActualAnchor,
  recalculate: recalculateSnapshotsFrom, complete: completeKernelNtaSnapshots
};

export async function createKernelPriceAnchor(
  body: unknown,
  user: AuthenticatedUser,
  now: () => Date = () => new Date(),
  dependencies: KernelAnchorSaveDependencies = kernelAnchorSaveDependencies
): Promise<KernelPriceAnchor> {
  const input = parseCreateInput(body);
  const instrument = await dependencies.findInstrument();
  if (!instrument) throw new ApiRequestError("INTERNAL_ERROR", "Kernel estimate instrument is not configured.", 500);
  const result = await dependencies.save(instrument.id, input, user.id, now().toISOString());
  if (result.pending_snapshot_from) {
    await dependencies.recalculate(result.pending_snapshot_from);
    await dependencies.complete(instrument.id, result.refresh_token);
  }
  return result.anchor;
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
  const fields = body as Record<string, unknown>;
  const actualSource = fields.actualSource ?? "User observed Kernel unit price";
  const observedPrecision = kernelUnitPrice.split(".")[1]?.length ?? 0;
  const actualPricePrecision = fields.actualPricePrecision ?? observedPrecision;
  if (typeof actualSource !== "string" || !actualSource.trim() || actualSource.trim().length > 200
    || !Number.isInteger(actualPricePrecision) || Number(actualPricePrecision) < observedPrecision || Number(actualPricePrecision) > 10) {
    throw new ApiRequestError("VALIDATION_ERROR", "Actual source and observed decimal precision are invalid.", 400);
  }
  return { anchorDate, kernelUnitPrice: price.toString(), actualSource: actualSource.trim(), actualPricePrecision: Number(actualPricePrecision) };
}
