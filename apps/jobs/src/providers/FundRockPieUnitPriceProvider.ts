import Decimal from "decimal.js";
import type { CurrencyCode } from "@family-ledger/shared";
import type {
  FetchLatestInstrumentPricesInput,
  InstrumentPriceProviderPrice,
  InstrumentPriceProviderResult,
  IInstrumentPriceProvider
} from "./IInstrumentPriceProvider";

interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface FundRockPieUnitPriceProviderOptions {
  fetchFn?: FetchLike;
  endpoint?: string;
}

export const FUNDROCK_DOCUMENTS_ENDPOINT =
  "https://www.fundrock.com/fundrock-new-zealand/frnz-documents-and-reporting/";

export class FundRockPieUnitPriceProvider implements IInstrumentPriceProvider {
  readonly name = "FundRock";

  private readonly fetchFn: FetchLike;
  private readonly endpoint: string;

  constructor(options: FundRockPieUnitPriceProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpoint ?? FUNDROCK_DOCUMENTS_ENDPOINT;
  }

  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const response = await this.fetchFn(this.endpoint);

    if (!response.ok) {
      throw new Error(`FundRock request failed with status ${response.status}.`);
    }

    const pageText = normalizeHtmlText(await response.text());
    const prices = input.instruments.map((instrument) =>
      extractFundUnitPrice(pageText, instrument.providerInstrumentName, instrument.sourceSymbol, instrument.currency)
    );

    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      prices
    };
  }
}

function extractFundUnitPrice(
  pageText: string,
  providerInstrumentName: string,
  sourceSymbol: string,
  currency: CurrencyCode
): InstrumentPriceProviderPrice {
  if (currency !== "NZD") {
    throw new Error(`FundRock unit prices only support NZD instruments. ${sourceSymbol} uses ${currency}.`);
  }

  const escapedName = escapeRegex(providerInstrumentName);
  const rowPattern = new RegExp(
    `${escapedName}\\s+(\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})\\s+` +
      `([0-9]+(?:\\.[0-9]+)?)\\s+` +
      `[0-9]+(?:\\.[0-9]+)?\\s+` +
      `[0-9]+(?:\\.[0-9]+)?\\s+\\$`,
    "i"
  );
  const match = rowPattern.exec(pageText);

  if (!match) {
    throw new Error(`FundRock unit price row is missing for ${providerInstrumentName}.`);
  }

  return {
    sourceSymbol,
    priceDate: toIsoDate(match[1], providerInstrumentName),
    closePrice: requiredPositiveDecimal(match[2], providerInstrumentName),
    currency
  };
}

function normalizeHtmlText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(value: string, providerInstrumentName: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

  if (!match) {
    throw new Error(`FundRock unit price date is invalid for ${providerInstrumentName}.`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`FundRock unit price date is invalid for ${providerInstrumentName}.`);
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function requiredPositiveDecimal(value: string, providerInstrumentName: string): string {
  const price = new Decimal(value);

  if (!price.isFinite() || price.lte(0)) {
    throw new Error(`FundRock unit price must be positive for ${providerInstrumentName}.`);
  }

  return price.toString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
