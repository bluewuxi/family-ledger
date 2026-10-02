import Decimal from "decimal.js";
import {
  fetchYahooFinanceDailyBars,
  getKernelValuationDateForNzxSession,
  type KernelPriceAnchor,
  type YahooFinanceFetch
} from "@family-ledger/shared";
import { listKernelPriceAnchorsByInstrumentIds } from "../repositories/kernelPriceAnchorRepository";
import type { FetchLatestInstrumentPricesInput, InstrumentPriceProviderResult, IInstrumentPriceProvider } from "./IInstrumentPriceProvider";

export interface KernelEstimatedInstrumentPriceProviderOptions {
  fetchFn?: YahooFinanceFetch;
  endpointBaseUrl?: string;
  listAnchors?: (instrumentIds: string[]) => Promise<KernelPriceAnchor[]>;
}

export class KernelEstimatedInstrumentPriceProvider implements IInstrumentPriceProvider {
  readonly name = "Kernel Estimate (USF.NZ)";
  private readonly listAnchors: (instrumentIds: string[]) => Promise<KernelPriceAnchor[]>;

  constructor(private readonly options: KernelEstimatedInstrumentPriceProviderOptions = {}) {
    this.listAnchors = options.listAnchors ?? listKernelPriceAnchorsByInstrumentIds;
  }

  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const anchors = await this.listAnchors(input.instruments.map((instrument) => instrument.instrumentId));
    const prices = [];
    const skippedSourceSymbols: string[] = [];
    for (const instrument of input.instruments) {
      if (instrument.currency !== "NZD" || instrument.sourceSymbol !== "USF.NZ" || instrument.sourceExchange !== "NZX") {
        throw new Error(`Kernel estimate instrument ${instrument.instrumentId} has invalid proxy configuration.`);
      }
      const instrumentAnchors = anchors
        .filter((candidate) => candidate.instrumentId === instrument.instrumentId)
        .sort((left, right) => right.proxyPriceDate.localeCompare(left.proxyPriceDate)
          || right.anchorDate.localeCompare(left.anchorDate)
          || right.createdAt.localeCompare(left.createdAt));
      const latestAnchor = instrumentAnchors[0];
      if (!latestAnchor) throw new Error(`Kernel estimate instrument ${instrument.instrumentId} has no applicable price anchor.`);

      const yahoo = await fetchYahooFinanceDailyBars(
        {
          sourceSymbol: instrument.sourceSymbol,
          expectedCurrency: "NZD",
          expectedExchangeTimeZone: "Pacific/Auckland",
          fetchedAt: input.fetchedAt,
          fromDate: latestAnchor.anchorDate,
          requiredPriceField: "open",
          confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 10, minute: 5 }
        },
        this.options
      );
      const latestBar = yahoo.bars.at(-1);
      if (!latestBar) throw new Error("Yahoo Finance returned no confirmed USF.NZ bar.");
      if (!latestBar.openPrice) throw new Error("Yahoo Finance returned a confirmed USF.NZ bar without an opening price.");
      const valuationDate = getKernelValuationDateForNzxSession(latestBar.priceDate);
      if (instrumentAnchors.some((candidate) => candidate.anchorDate === valuationDate)) {
        skippedSourceSymbols.push(instrument.sourceSymbol);
        continue;
      }
      const anchor = instrumentAnchors.find((candidate) =>
        candidate.anchorDate <= valuationDate && candidate.proxyPriceDate <= latestBar.priceDate
      );
      if (!anchor) throw new Error(`Kernel estimate instrument ${instrument.instrumentId} has no applicable price anchor.`);
      const estimate = new Decimal(anchor.kernelUnitPrice)
        .times(latestBar.openPrice)
        .dividedBy(anchor.proxyClose)
        .toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
      if (!estimate.isFinite() || estimate.lte(0)) throw new Error("Kernel estimate calculation produced an invalid price.");
      prices.push({
        sourceSymbol: instrument.sourceSymbol,
        priceDate: valuationDate,
        closePrice: estimate.toFixed(10),
        currency: instrument.currency,
        isEstimated: true
      });
    }
    return { provider: this.name, fetchedAt: input.fetchedAt, prices, skippedSourceSymbols };
  }
}
