import {
  ACCOUNT_TYPES,
  CURRENCY_CODES,
  MARKET_REGIONS,
  type AccountType,
  type AuthenticatedUser,
  type CreateInvestmentAccountInput,
  type CurrencyCode,
  type InvestmentAccount,
  type MarketRegion,
  type UpdateInvestmentAccountInput
} from "@family-ledger/shared";
import {
  AccountInUseError,
  AccountNotFoundError,
  countAccountTransactions,
  createAccount,
  deleteAccount,
  findAccountById,
  listAccounts,
  updateAccount
} from "../repositories/accountRepository";
import { createTradingPasswordPlaceholder, deleteTradingPasswordParameter } from "./accountTradingPasswordService";
import { ApiRequestError } from "../utils/apiError";

export async function getAccounts(): Promise<InvestmentAccount[]> {
  return listAccounts();
}

export async function createInvestmentAccount(
  body: unknown,
  user: AuthenticatedUser
): Promise<InvestmentAccount> {
  const input = parseCreateAccountInput(body);
  const account = await createAccount(input, user.id);

  try {
    await createTradingPasswordPlaceholder(account.id);
  } catch (error) {
    try {
      await deleteAccount(account.id);
    } catch (cleanupError) {
      console.error("Failed to clean up account after trading password placeholder creation failed", {
        accountId: account.id,
        error: cleanupError
      });
    }

    throw error;
  }

  return account;
}

export async function updateInvestmentAccount(
  id: string,
  body: unknown,
  user: AuthenticatedUser
): Promise<InvestmentAccount> {
  assertUuid(id);
  const input = parseUpdateAccountInput(body);

  try {
    return await updateAccount(id, input, user.id);
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Account was not found.", 404);
    }

    throw error;
  }
}

export async function deleteInvestmentAccount(id: string): Promise<void> {
  assertUuid(id);

  try {
    const account = await findAccountById(id);

    if (!account) {
      await deleteTradingPasswordParameter(id);
      throw new AccountNotFoundError();
    }

    if ((await countAccountTransactions(id)) > 0) {
      throw new AccountInUseError();
    }

    await deleteAccount(id);
    await deleteTradingPasswordParameter(id);
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Account was not found.", 404);
    }

    if (error instanceof AccountInUseError) {
      throw new ApiRequestError("VALIDATION_ERROR", "Account cannot be deleted because it is used by transactions.", 400);
    }

    throw error;
  }
}

function parseCreateAccountInput(body: unknown): CreateInvestmentAccountInput {
  const record = asRecord(body);
  const name = requiredString(record.name, "name");

  return {
    name,
    broker: optionalString(record.broker, "broker"),
    accountType: requiredEnum(record.accountType, ACCOUNT_TYPES, "accountType"),
    baseCurrency: requiredEnum(record.baseCurrency, CURRENCY_CODES, "baseCurrency"),
    marketRegion: requiredEnum(record.marketRegion, MARKET_REGIONS, "marketRegion"),
    notes: optionalString(record.notes, "notes"),
    tradingInfo: optionalString(record.tradingInfo, "tradingInfo")
  };
}

function parseUpdateAccountInput(body: unknown): UpdateInvestmentAccountInput {
  const record = asRecord(body);
  const input: UpdateInvestmentAccountInput = {};

  if ("name" in record) {
    input.name = requiredString(record.name, "name");
  }

  if ("broker" in record) {
    input.broker = optionalString(record.broker, "broker");
  }

  if ("accountType" in record) {
    input.accountType = requiredEnum(record.accountType, ACCOUNT_TYPES, "accountType");
  }

  if ("baseCurrency" in record) {
    input.baseCurrency = requiredEnum(record.baseCurrency, CURRENCY_CODES, "baseCurrency");
  }

  if ("marketRegion" in record) {
    input.marketRegion = requiredEnum(record.marketRegion, MARKET_REGIONS, "marketRegion");
  }

  if ("notes" in record) {
    input.notes = optionalString(record.notes, "notes");
  }

  if ("tradingInfo" in record) {
    input.tradingInfo = optionalString(record.tradingInfo, "tradingInfo");
  }

  if (Object.keys(input).length === 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "At least one account field is required.", 400);
  }

  return input;
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

function requiredEnum<T extends AccountType | CurrencyCode | MarketRegion>(
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
    throw new ApiRequestError("VALIDATION_ERROR", "Account id is invalid.", 400);
  }
}
