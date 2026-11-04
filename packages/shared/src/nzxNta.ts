import Decimal from "decimal.js";
import { getKernelValuationDateForNzxSession } from "./kernelPriceEstimation";
import type { KernelPriceAnchor } from "./index";

export const KERNEL_NTA_PROVIDER = "Kernel Estimate (USF NTA)";
const KernelDecimal = Decimal.clone({ precision: 80 });
export interface NzxNtaRecord {
  ntaDate: string;
  unitNta: string;
  announcementId: number;
  publishedAt: string;
}
export interface KernelNtaPlan {
  instrumentId: string;
  anchors: KernelPriceAnchor[];
  estimates: Array<{ priceDate: string; closePrice: string; fetchedAt: string; nta: NzxNtaRecord }>;
  fromDate: string;
  fetchedAt: string;
}
export type NzxNtaFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function parseNzxNtaAnnouncements(value: unknown, fetchedAt: string): NzxNtaRecord[] {
  const cutoff = Date.parse(fetchedAt);
  if (!Array.isArray(value) || !Number.isFinite(cutoff)) throw new Error("Invalid NZX NTA response or fetch time.");
  const records = new Map<string, NzxNtaRecord>();
  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("Invalid NZX announcement.");
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string") throw new Error("Missing NZX announcement title.");
    if (!/USF NTA/.test(row.title)) continue;
    const match = /^(?:AMENDED:\s*)?USF NTA (\d{2})-(\d{2})-(\d{4}) \$(\d+(?:\.\d+)?)$/.exec(row.title);
    if (!match || row.companyCode !== "USF" || row.securityCode !== "USF"
      || typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0
      || typeof row.publicationDate !== "number" || !Number.isFinite(row.publicationDate)) {
      throw new Error("Invalid USF NTA announcement.");
    }
    const ntaDate = `${match[3]}-${match[2]}-${match[1]}`;
    getKernelValuationDateForNzxSession(ntaDate);
    const price = new Decimal(match[4]);
    if (!price.isFinite() || price.lte(0) || price.decimalPlaces() > 10 || price.gte("1e18")) throw new Error("Invalid USF NTA value.");
    const milliseconds = row.publicationDate * 1000;
    if (!Number.isFinite(milliseconds) || Number.isNaN(new Date(milliseconds).getTime())) throw new Error("Invalid NTA publication time.");
    if (milliseconds > cutoff) continue;
    const record = { ntaDate, unitNta: match[4], announcementId: row.id, publishedAt: new Date(milliseconds).toISOString() };
    const previous = records.get(ntaDate);
    if (!previous || record.publishedAt > previous.publishedAt
      || (record.publishedAt === previous.publishedAt && record.announcementId > previous.announcementId)) records.set(ntaDate, record);
  }
  return [...records.values()].sort((a, b) => a.ntaDate.localeCompare(b.ntaDate));
}

export async function fetchNzxUsfNta(input: { fromDate: string; fetchedAt: string }, fetchFn: NzxNtaFetch = fetch): Promise<NzxNtaRecord[]> {
  const from = new Date(`${input.fromDate}T00:00:00Z`);
  const now = new Date(input.fetchedAt);
  if (Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== input.fromDate || Number.isNaN(now.getTime())) throw new Error("Invalid NTA query dates.");
  const lastYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Pacific/Auckland", year: "numeric" }).format(now));
  const announcements: unknown[] = [];
  // The list year is publication year, so include the following year at boundaries.
  for (let year = from.getUTCFullYear(); year <= lastYear; year++) {
    const response = await fetchFn(`https://api.nzx.com/public/company/USF000000/announcements/${year}/all.json`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`NZX NTA request failed (${response.status}).`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Invalid NZX NTA annual list.");
    announcements.push(...body);
  }
  return parseNzxNtaAnnouncements(announcements, input.fetchedAt).filter(row => row.ntaDate >= input.fromDate);
}

export function prepareKernelNtaPlan(anchors: KernelPriceAnchor[], records: NzxNtaRecord[], fetchedAt: string): KernelNtaPlan {
  // Derived NTA revisions never supersede the chronology of actual user inputs.
  const roots = anchors.filter(anchor => !anchor.derivedFromAnchorId);
  if (!roots.length) throw new Error("Kernel has no actual price anchor.");
  if (new Set(roots.map(anchor => anchor.instrumentId)).size !== 1) throw new Error("Mixed Kernel targets.");
  const exactDates = new Set(roots.map(anchor => anchor.anchorDate));
  const converted = roots.map(anchor => {
    const available = records.filter(row => getKernelValuationDateForNzxSession(row.ntaDate) === anchor.anchorDate);
    for (const reference of anchors.filter(a => a.instrumentId === anchor.instrumentId && a.anchorDate === anchor.anchorDate)) {
      if (reference.proxyValueType === "nta" && reference.proxyClose && reference.proxyPriceDate
        && reference.proxyAnnouncementId && reference.proxyPublishedAt) {
        available.push({ ntaDate: reference.proxyPriceDate, unitNta: reference.proxyClose,
          announcementId: reference.proxyAnnouncementId, publishedAt: reference.proxyPublishedAt });
      }
    }
    const nta = available.filter(row => Date.parse(row.publishedAt) <= Date.parse(fetchedAt))
      .sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || b.announcementId - a.announcementId)[0];
    if (!nta) return { ...anchor, proxyValueType: "pending" as const, pairingStatus: "pending" as const,
      proxyClose: null, proxyPriceDate: null, proxyFetchedAt: null, proxyAnnouncementId: null, proxyPublishedAt: null };
    return { ...anchor, proxyValueType: "nta" as const, proxyClose: nta.unitNta,
      proxyPriceDate: nta.ntaDate, proxyFetchedAt: fetchedAt,
      proxyAnnouncementId: nta.announcementId, proxyPublishedAt: nta.publishedAt, pairingStatus: "paired" as const };
  }).sort((a, b) => b.anchorDate.localeCompare(a.anchorDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const estimates = records.flatMap(row => {
    const priceDate = getKernelValuationDateForNzxSession(row.ntaDate);
    if (exactDates.has(priceDate)) return [];
    // Choose the actual revision first. A pending winner blocks its own interval.
    const anchor = converted.find(a => a.anchorDate <= priceDate);
    if (!anchor?.proxyClose || !anchor.proxyPriceDate || anchor.proxyPriceDate > row.ntaDate) return [];
    const result = new KernelDecimal(anchor.kernelUnitPrice).times(row.unitNta).div(anchor.proxyClose).toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
    if (!result.isFinite() || result.lte(0)) throw new Error("Invalid Kernel NTA estimate.");
    return [{ priceDate, closePrice: result.toFixed(10), fetchedAt, nta: row }];
  });
  return { instrumentId: roots[0].instrumentId, anchors: converted, estimates,
    fromDate: roots.map(a => a.anchorDate).sort()[0], fetchedAt };
}

export function kernelNtaRpcArguments(plan: KernelNtaPlan) {
  return {
    p_instrument_id: plan.instrumentId, p_from_date: plan.fromDate, p_fetched_at: plan.fetchedAt,
    p_anchors: plan.anchors.map(a => ({ source_id: a.id, anchor_date: a.anchorDate, kernel_unit_price: a.kernelUnitPrice,
      proxy_close: a.proxyClose, proxy_price_date: a.proxyPriceDate, announcement_id: a.proxyAnnouncementId,
      published_at: a.proxyPublishedAt, created_by_user_id: a.createdByUserId, revision_at: a.createdAt })),
    p_estimates: plan.estimates.map(e => ({ price_date: e.priceDate, close_price: e.closePrice,
      nta_date: e.nta.ntaDate, unit_nta: e.nta.unitNta, announcement_id: e.nta.announcementId, published_at: e.nta.publishedAt }))
  };
}
