import {
  ASSET_TYPES,
  CURRENCY_CODES,
  MARKET_REGIONS,
  PRICE_SOURCES,
  type AssetType,
  type AuthenticatedUser,
  type CreateInstrumentInput,
  type CurrencyCode,
  type Instrument,
  type MarketRegion,
  type PriceSource,
  type UpdateInstrumentInput
} from "@family-ledger/shared";
import {
  InstrumentDuplicateError,
  InstrumentInUseError,
  InstrumentNotFoundError,
  createInstrument,
  deleteInstrument,
  findInstrumentById,
  listInstruments,
  updateInstrument
} from "../repositories/instrumentRepository";
import { ApiRequestError } from "../utils/apiError";

export async function getInstruments(): Promise<Instrument[]> {
  return listInstruments();
}

export async function createInvestmentInstrument(body: unknown, user: AuthenticatedUser): Promise<Instrument> {
  const input = parseCreateInstrumentInput(body);

  try {
    return await createInstrument(input, user.id);
  } catch (error) {
    if (error instanceof InstrumentDuplicateError) {
      throw new ApiRequestError(
        "VALIDATION_ERROR",
        "An instrument with the same market, exchange, and symbol already exists.",
        400
      );
    }

    throw error;
  }
}

export async function updateInvestmentInstrument(
  id: string,
  body: unknown,
  user: AuthenticatedUser
): Promise<Instrument> {
  assertUuid(id);
  const input = parseUpdateInstrumentInput(body);
  const existing = await findInstrumentById(id);

  if (!existing) {
    throw new ApiRequestError("NOT_FOUND", "Instrument was not found.", 404);
  }

  validateInstrumentIdentity({
    assetType: input.assetType ?? existing.assetType,
    symbol: input.symbol !== undefined ? input.symbol : existing.symbol,
    exchange: input.exchange !== undefined ? input.exchange : existing.exchange
  });

  try {
    return await updateInstrument(id, input, user.id);
  } catch (error) {
    if (error instanceof InstrumentNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Instrument was not found.", 404);
    }

    if (error instanceof InstrumentDuplicateError) {
      throw new ApiRequestError(
        "VALIDATION_ERROR",
        "An instrument with the same market, exchange, and symbol already exists.",
        400
      );
    }

    throw error;
  }
}

export async function deleteInvestmentInstrument(id: string): Promise<void> {
  assertUuid(id);

  try {
    await deleteInstrument(id);
  } catch (error) {
    if (error instanceof InstrumentNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Instrument was not found.", 404);
    }

    if (error instanceof InstrumentInUseError) {
      throw new ApiRequestError(
        "VALIDATION_ERROR",
        "Instrument cannot be deleted because it has transaction or price history.",
        400
      );
    }

    throw error;
  }
}

function parseCreateInstrumentInput(body: unknown): CreateInstrumentInput {
  const record = asRecord(body);
  const input: CreateInstrumentInput = {
    symbol: optionalString(record.symbol, "symbol"),
    name: requiredString(record.name, "name"),
    description: optionalString(record.description, "description"),
    marketRegion: requiredEnum(record.marketRegion, MARKET_REGIONS, "marketRegion"),
    exchange: optionalString(record.exchange, "exchange"),
    currency: requiredEnum(record.currency, CURRENCY_CODES, "currency"),
    assetType: requiredEnum(record.assetType, ASSET_TYPES, "assetType"),
    isin: optionalString(record.isin, "isin"),
    provider: optionalString(record.provider, "provider"),
    priceSource: requiredEnum(record.priceSource, PRICE_SOURCES, "priceSource"),
    priceSourceSymbol: optionalString(record.priceSourceSymbol, "priceSourceSymbol"),
    priceSourceExchange: optionalString(record.priceSourceExchange, "priceSourceExchange"),
    priceUpdateEnabled: requiredBoolean(record.priceUpdateEnabled, "priceUpdateEnabled"),
    priceUpdatePriority: requiredNonNegativeInteger(record.priceUpdatePriority, "priceUpdatePriority"),
    sourceUrl: optionalString(record.sourceUrl, "sourceUrl"),
    sourceCheckedAt: optionalTimestamp(record.sourceCheckedAt, "sourceCheckedAt"),
    notes: optionalString(record.notes, "notes")
  };

  validateInstrumentIdentity(input);
  return input;
}

function parseUpdateInstrumentInput(body: unknown): UpdateInstrumentInput {
  const record = asRecord(body);
  const input: UpdateInstrumentInput = {};

  if ("symbol" in record) {
    input.symbol = optionalString(record.symbol, "symbol");
  }

  if ("name" in record) {
    input.name = requiredString(record.name, "name");
  }

  if ("description" in record) {
    input.description = optionalString(record.description, "description");
  }

  if ("marketRegion" in record) {
    input.marketRegion = requiredEnum(record.marketRegion, MARKET_REGIONS, "marketRegion");
  }

  if ("exchange" in record) {
    input.exchange = optionalString(record.exchange, "exchange");
  }

  if ("currency" in record) {
    input.currency = requiredEnum(record.currency, CURRENCY_CODES, "currency");
  }

  if ("assetType" in record) {
    input.assetType = requiredEnum(record.assetType, ASSET_TYPES, "assetType");
  }

  if ("isin" in record) {
    input.isin = optionalString(record.isin, "isin");
  }

  if ("provider" in record) {
    input.provider = optionalString(record.provider, "provider");
  }

  if ("priceSource" in record) {
    input.priceSource = requiredEnum(record.priceSource, PRICE_SOURCES, "priceSource");
  }

  if ("priceSourceSymbol" in record) {
    input.priceSourceSymbol = optionalString(record.priceSourceSymbol, "priceSourceSymbol");
  }

  if ("priceSourceExchange" in record) {
    input.priceSourceExchange = optionalString(record.priceSourceExchange, "priceSourceExchange");
  }

  if ("priceUpdateEnabled" in record) {
    input.priceUpdateEnabled = requiredBoolean(record.priceUpdateEnabled, "priceUpdateEnabled");
  }

  if ("priceUpdatePriority" in record) {
    input.priceUpdatePriority = requiredNonNegativeInteger(record.priceUpdatePriority, "priceUpdatePriority");
  }

  if ("sourceUrl" in record) {
    input.sourceUrl = optionalString(record.sourceUrl, "sourceUrl");
  }

  if ("sourceCheckedAt" in record) {
    input.sourceCheckedAt = optionalTimestamp(record.sourceCheckedAt, "sourceCheckedAt");
  }

  if ("notes" in record) {
    input.notes = optionalString(record.notes, "notes");
  }

  if (Object.keys(input).length === 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "At least one instrument field is required.", 400);
  }

  return input;
}

function validateInstrumentIdentity(input: Pick<CreateInstrumentInput, "assetType" | "symbol" | "exchange">): void {
  const hasSymbol = Boolean(input.symbol);
  const hasExchange = Boolean(input.exchange);

  if (hasSymbol !== hasExchange) {
    throw new ApiRequestError("VALIDATION_ERROR", "symbol and exchange must be supplied together.", 400);
  }

  if (input.assetType !== "other" && (!hasSymbol || !hasExchange)) {
    throw new ApiRequestError("VALIDATION_ERROR", "symbol and exchange are required for this asset type.", 400);
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} cannot be empty.`, 400);
  }

  return trimmed;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a string.`, 400);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const timestamp = optionalString(value, field);

  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a valid timestamp.`, 400);
  }

  return parsed.toISOString();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a boolean.`, 400);
  }

  return value;
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a non-negative integer.`, 400);
  }

  return value;
}

function requiredEnum<T extends AssetType | CurrencyCode | MarketRegion | PriceSource>(
  value: unknown,
  allowedValues: readonly T[],
  field: string
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is invalid.`, 400);
  }

  return value as T;
}

function assertUuid(id: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Instrument id is invalid.", 400);
  }
}
