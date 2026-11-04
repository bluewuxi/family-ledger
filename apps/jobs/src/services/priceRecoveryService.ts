import type { CreateInstrumentPriceInput, CurrencyCode } from "@family-ledger/shared";
import * as acquisitionRepository from "../repositories/priceAcquisitionRepository";
import type { DuePriceGap, PriceAcquisitionLease } from "../repositories/priceAcquisitionRepository";
import { yahooHistoricalRecoveryProvider } from "../providers/YahooFinanceInstrumentPriceProvider";

export interface HistoricalRecoveryProvider {
  source: string;
  fetchHistory(input: { instrumentId: string; sourceSymbol: string; currency: CurrencyCode; sourceExchange: string | null; fromDate: string; toDate: string; fetchedAt: string; signal: AbortSignal }): Promise<CreateInstrumentPriceInput[]>;
}
export interface PriceRecoveryRepository {
  listDuePriceGaps: typeof acquisitionRepository.listDuePriceGaps;
  claimPriceAcquisition: typeof acquisitionRepository.claimPriceAcquisition;
  completePriceAcquisition: typeof acquisitionRepository.completePriceAcquisition;
  countUnresolvedPriceGaps?: typeof acquisitionRepository.countUnresolvedPriceGaps;
}
export interface PriceRecoveryResult { attempted: number; resolved: number; pending: number; needsAttention: number; incomplete: boolean; }

/** Missing historical coverage is durable work, independent of a successful Lambda execution. */
export async function recoverHistoricalPrices(input: {
  throughDate: string; budgetMs: number; limit?: number; repository?: PriceRecoveryRepository;
  providers?: HistoricalRecoveryProvider[]; now?: () => number;
}): Promise<PriceRecoveryResult> {
  const repository = input.repository ?? acquisitionRepository;
  const providers = input.providers ?? [yahooHistoricalRecoveryProvider];
  const now = input.now ?? Date.now;
  const deadline = now() + Math.max(0, input.budgetMs);
  const gaps = await repository.listDuePriceGaps({ throughDate: input.throughDate, limit: input.limit ?? 100 });
  const result: PriceRecoveryResult = { attempted: 0, resolved: 0, pending: 0, needsAttention: 0, incomplete: false };
  const groups = groupConsecutiveGaps(gaps);
  for (const group of groups) {
    if (now() >= deadline) { result.incomplete = true; break; }
    const claimed: Array<{ gap: DuePriceGap; lease: PriceAcquisitionLease }> = [];
    for (const gap of group) {
      if (now() >= deadline) { result.incomplete = true; break; }
      const lease = await repository.claimPriceAcquisition({ ...gap, leaseSeconds: Math.min(300, Math.max(1, Math.ceil((deadline - now()) / 1000) + 5)) });
      if (lease) claimed.push({ gap, lease });
    }
    if (!claimed.length) continue;
    result.attempted += claimed.length;
    const provider = providers.find(p => p.source === group[0].source);
    let prices: CreateInstrumentPriceInput[] = [];
    let failed = false;
    let retryAfterSeconds: number | undefined;
    if (provider) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        prices = await Promise.race([
          provider.fetchHistory({ ...group[0], fromDate: claimed[0].gap.targetDate, toDate: claimed[claimed.length - 1].gap.targetDate, fetchedAt: new Date(now()).toISOString(), signal: controller.signal }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Historical acquisition deadline exceeded.")); }, Math.max(1, deadline - now())); })
        ]);
      } catch (error) { failed = true; retryAfterSeconds = (error as {retryAfterSeconds?: number}).retryAfterSeconds; }
      finally { if (timer) clearTimeout(timer); }
    }
    for (const { gap, lease } of claimed) {
      const ownPrices = prices.filter(p => p.instrumentId === gap.instrumentId && p.priceDate === gap.targetDate && p.currency === gap.currency);
      const status = !provider ? "unsupported" : failed ? "failed" : ownPrices.length ? "success" : "unavailable";
      const saved = await repository.completePriceAcquisition({ leaseToken: lease.leaseToken, status,
        reason: status === "success" ? undefined : status === "unsupported" ? "HISTORY_UNSUPPORTED" : status === "unavailable" ? "DATE_NOT_PUBLISHED" : retryAfterSeconds ? "SOURCE_COOLDOWN" : "ACQUISITION_FAILED",
        prices: status === "success" ? ownPrices : [], retryAfterSeconds });
      if (saved && status === "success") result.resolved++;
      else if (status === "unsupported") result.needsAttention++;
      else result.pending++;
    }
  }
  if (repository.countUnresolvedPriceGaps) {
    const outstanding = await repository.countUnresolvedPriceGaps({ throughDate: input.throughDate });
    result.pending = outstanding.pending;
    result.needsAttention = outstanding.needsAttention;
  }
  result.incomplete ||= result.pending > 0 || result.needsAttention > 0 || result.attempted < gaps.length;
  return result;
}

function groupConsecutiveGaps(gaps: DuePriceGap[]): DuePriceGap[][] {
  const sorted = [...gaps].sort((a, b) => a.source.localeCompare(b.source) || a.instrumentId.localeCompare(b.instrumentId) || a.targetDate.localeCompare(b.targetDate));
  const groups: DuePriceGap[][] = [];
  for (const gap of sorted) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (previous && previous.source === gap.source && previous.instrumentId === gap.instrumentId
      && Date.parse(gap.targetDate) - Date.parse(previous.targetDate) === 86_400_000) current.push(gap);
    else groups.push([gap]);
  }
  return groups;
}
