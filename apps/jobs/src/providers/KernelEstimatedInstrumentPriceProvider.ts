import { fetchNzxUsfNta, prepareKernelNtaPlan, KERNEL_NTA_PROVIDER, type KernelPriceAnchor, type NzxNtaFetch } from "@family-ledger/shared";
import { listKernelPriceAnchorsByInstrumentIds } from "../repositories/kernelPriceAnchorRepository";
import type { FetchLatestInstrumentPricesInput, InstrumentPriceProviderResult, IInstrumentPriceProvider } from "./IInstrumentPriceProvider";
export interface KernelEstimatedInstrumentPriceProviderOptions {
  fetchFn?: NzxNtaFetch;
  listAnchors?: (instrumentIds: string[]) => Promise<KernelPriceAnchor[]>;
}
export class KernelEstimatedInstrumentPriceProvider implements IInstrumentPriceProvider {
  readonly name = KERNEL_NTA_PROVIDER;
  constructor(private readonly options: KernelEstimatedInstrumentPriceProviderOptions = {}) {}
  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const anchors = await (this.options.listAnchors ?? listKernelPriceAnchorsByInstrumentIds)(input.instruments.map(i => i.instrumentId));
    const kernelNtaPlans = [];
    for (const instrument of input.instruments) {
      if (instrument.currency !== "NZD" || instrument.sourceSymbol !== "USF.NZ" || instrument.sourceExchange !== "NZX") throw new Error("Invalid Kernel NTA configuration.");
      const history = anchors.filter(a => a.instrumentId === instrument.instrumentId);
      const fromDate = history.map(a => a.anchorDate).sort()[0];
      if (!fromDate) throw new Error("Kernel has no actual price anchor.");
      const records = await fetchNzxUsfNta({ fromDate, fetchedAt: input.fetchedAt }, this.options.fetchFn);
      kernelNtaPlans.push(prepareKernelNtaPlan(history, records, input.fetchedAt));
    }
    return { provider: this.name, fetchedAt: input.fetchedAt, prices: [], kernelNtaPlans };
  }
}
