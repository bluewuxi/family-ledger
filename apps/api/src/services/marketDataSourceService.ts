import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { fetchNzxUsfNta, prepareKernelNtaPlan, type KernelNtaPlan } from "@family-ledger/shared";
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
  refreshKernelNta,
  completeKernelNtaSnapshots,
} from "../repositories/marketDataSourceRepository";
import { ApiRequestError } from "../utils/apiError";
import { recalculateSnapshotsFrom } from "./snapshotRecalculationService";

const KERNEL_PROXY_SYMBOL = "USF.NZ";
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
  const existingAnchors = await listKernelPriceAnchors();
  const previous = existingAnchors.find(a => !a.derivedFromAnchorId && a.proxyValueType === "nta"
    && a.anchorDate === input.anchorDate && new Decimal(a.kernelUnitPrice).eq(input.kernelUnitPrice));
  const candidate: KernelPriceAnchor = previous ?? {
    id: randomUUID(), instrumentId: instrument.id, anchorDate: input.anchorDate,
    kernelUnitPrice: input.kernelUnitPrice, proxySymbol: KERNEL_PROXY_SYMBOL,
    proxyCurrency: "NZD", proxyClose: "0", proxyPriceDate: input.anchorDate,
    proxyFetchedAt: fetchedAt, createdByUserId: user.id, createdAt: fetchedAt, proxyValueType: "nta"
  };
  const anchors = previous ? existingAnchors : [candidate, ...existingAnchors];
  let plan: KernelNtaPlan;
  try {
    const records = await fetchNzxUsfNta({ fromDate: anchors.map(a => a.anchorDate).sort()[0], fetchedAt });
    plan = prepareKernelNtaPlan(anchors, records, fetchedAt);
  } catch (error) {
    const missing = error instanceof Error && error.message.startsWith("No corresponding published USF NTA");
    throw new ApiRequestError(missing ? "DATA_SOURCE_DATE_UNAVAILABLE" : "DATA_SOURCE_UNAVAILABLE",
      missing ? "No corresponding published USF NTA is available for a Kernel anchor date." : "USF NTA data is unavailable.", missing ? 422 : 502);
  }
  const result = await refreshKernelNta(plan);
  if (result.pending_snapshot_from) {
    await recalculateSnapshotsFrom(result.pending_snapshot_from);
    await completeKernelNtaSnapshots(instrument.id, result.refresh_token);
  }
  const saved = (await listKernelPriceAnchors()).find(a => !a.derivedFromAnchorId && a.proxyValueType === "nta"
    && a.anchorDate === candidate.anchorDate && new Decimal(a.kernelUnitPrice).eq(candidate.kernelUnitPrice));
  if (!saved) throw new Error("Kernel NTA anchor not found after saving.");
  return saved;
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
