import Decimal from "decimal.js";
import {
  ADJUSTMENT_DIRECTIONS,
  CURRENCY_CODES,
  TRANSACTION_TYPES,
  type AdjustmentDirection,
  type AuthenticatedUser,
  type CreateInvestmentTransactionInput,
  type CurrencyCode,
  type Instrument,
  type InvestmentTransaction,
  type TransactionType,
  type UpdateInvestmentTransactionInput
} from "@family-ledger/shared";
import { findAccountById } from "../repositories/accountRepository";
import { findInstrumentById } from "../repositories/instrumentRepository";
import {
  TransactionNotFoundError,
  TransactionConstraintError,
  TransactionReferenceError,
  createTransaction,
  deleteTransaction,
  findTransactionById,
  listTransactions,
  updateTransaction
} from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";

export async function getTransactions(): Promise<InvestmentTransaction[]> {
  return listTransactions();
}

export async function createInvestmentTransaction(
  body: unknown,
  user: AuthenticatedUser
): Promise<InvestmentTransaction> {
  const record = asRecord(body);
  const input = parseCreateTransactionInput(record);
  const validated = await validateTransaction(input, "grossAmount" in record);

  try {
    return await createTransaction(validated, user.id);
  } catch (error) {
    if (error instanceof TransactionReferenceError) {
      throw new ApiRequestError("VALIDATION_ERROR", "Transaction account or instrument was not found.", 400);
    }

    if (error instanceof TransactionConstraintError) {
      throw new ApiRequestError("VALIDATION_ERROR", toTransactionConstraintMessage(error), 400);
    }

    throw error;
  }
}

export async function updateInvestmentTransaction(
  id: string,
  body: unknown,
  user: AuthenticatedUser
): Promise<InvestmentTransaction> {
  assertUuid(id, "Transaction");
  const record = asRecord(body);
  const patch = parseUpdateTransactionInput(record);
  const existing = await findTransactionById(id);

  if (!existing) {
    throw new ApiRequestError("NOT_FOUND", "Transaction was not found.", 404);
  }

  const candidate: CreateInvestmentTransactionInput = {
    accountId: patch.accountId ?? existing.accountId,
    instrumentId: patch.instrumentId ?? existing.instrumentId,
    transactionType: patch.transactionType ?? existing.transactionType,
    tradeDate: patch.tradeDate ?? existing.tradeDate,
    settlementDate: patch.settlementDate !== undefined ? patch.settlementDate : existing.settlementDate,
    quantity: patch.quantity !== undefined ? patch.quantity : existing.quantity,
    price: patch.price !== undefined ? patch.price : existing.price,
    grossAmount: patch.grossAmount !== undefined ? patch.grossAmount : existing.grossAmount,
    fee: patch.fee ?? existing.fee,
    tax: patch.tax ?? existing.tax,
    currency: patch.currency ?? existing.currency,
    adjustmentDirection:
      patch.adjustmentDirection !== undefined ? patch.adjustmentDirection : existing.adjustmentDirection,
    notes: patch.notes !== undefined ? patch.notes : existing.notes
  };

  const validated = await validateTransaction(candidate, "grossAmount" in record);

  try {
    return await updateTransaction(id, validated, user.id);
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Transaction was not found.", 404);
    }

    if (error instanceof TransactionReferenceError) {
      throw new ApiRequestError("VALIDATION_ERROR", "Transaction account or instrument was not found.", 400);
    }

    if (error instanceof TransactionConstraintError) {
      throw new ApiRequestError("VALIDATION_ERROR", toTransactionConstraintMessage(error), 400);
    }

    throw error;
  }
}

export async function deleteInvestmentTransaction(id: string): Promise<void> {
  assertUuid(id, "Transaction");

  try {
    await deleteTransaction(id);
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Transaction was not found.", 404);
    }

    throw error;
  }
}

function parseCreateTransactionInput(record: Record<string, unknown>): CreateInvestmentTransactionInput {
  return {
    accountId: requiredUuid(record.accountId, "accountId"),
    instrumentId: requiredUuid(record.instrumentId, "instrumentId"),
    transactionType: requiredEnum(record.transactionType, TRANSACTION_TYPES, "transactionType"),
    tradeDate: requiredDate(record.tradeDate, "tradeDate"),
    settlementDate: optionalDate(record.settlementDate, "settlementDate"),
    quantity: optionalString(record.quantity, "quantity"),
    price: optionalString(record.price, "price"),
    grossAmount: optionalString(record.grossAmount, "grossAmount"),
    fee: optionalString(record.fee, "fee") ?? "0",
    tax: optionalString(record.tax, "tax") ?? "0",
    currency: requiredEnum(record.currency, CURRENCY_CODES, "currency"),
    adjustmentDirection: optionalEnum(record.adjustmentDirection, ADJUSTMENT_DIRECTIONS, "adjustmentDirection"),
    notes: optionalString(record.notes, "notes")
  };
}

function parseUpdateTransactionInput(record: Record<string, unknown>): UpdateInvestmentTransactionInput {
  const input: UpdateInvestmentTransactionInput = {};

  if ("accountId" in record) {
    input.accountId = requiredUuid(record.accountId, "accountId");
  }
  if ("instrumentId" in record) {
    input.instrumentId = requiredUuid(record.instrumentId, "instrumentId");
  }
  if ("transactionType" in record) {
    input.transactionType = requiredEnum(record.transactionType, TRANSACTION_TYPES, "transactionType");
  }
  if ("tradeDate" in record) {
    input.tradeDate = requiredDate(record.tradeDate, "tradeDate");
  }
  if ("settlementDate" in record) {
    input.settlementDate = optionalDate(record.settlementDate, "settlementDate");
  }
  if ("quantity" in record) {
    input.quantity = optionalString(record.quantity, "quantity");
  }
  if ("price" in record) {
    input.price = optionalString(record.price, "price");
  }
  if ("grossAmount" in record) {
    input.grossAmount = optionalString(record.grossAmount, "grossAmount");
  }
  if ("fee" in record) {
    input.fee = optionalString(record.fee, "fee") ?? "0";
  }
  if ("tax" in record) {
    input.tax = optionalString(record.tax, "tax") ?? "0";
  }
  if ("currency" in record) {
    input.currency = requiredEnum(record.currency, CURRENCY_CODES, "currency");
  }
  if ("adjustmentDirection" in record) {
    input.adjustmentDirection = optionalEnum(record.adjustmentDirection, ADJUSTMENT_DIRECTIONS, "adjustmentDirection");
  }
  if ("notes" in record) {
    input.notes = optionalString(record.notes, "notes");
  }

  if (Object.keys(input).length === 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "At least one transaction field is required.", 400);
  }

  return input;
}

async function validateTransaction(
  input: CreateInvestmentTransactionInput,
  clientSuppliedGrossAmount: boolean
): Promise<CreateInvestmentTransactionInput> {
  if (input.settlementDate && input.settlementDate < input.tradeDate) {
    throw new ApiRequestError("VALIDATION_ERROR", "settlementDate cannot be before tradeDate.", 400);
  }

  const [account, instrument] = await Promise.all([
    findAccountById(input.accountId),
    findInstrumentById(input.instrumentId)
  ]);

  if (!account) {
    throw new ApiRequestError("VALIDATION_ERROR", "Transaction account was not found.", 400);
  }

  if (!instrument) {
    throw new ApiRequestError("VALIDATION_ERROR", "Transaction instrument was not found.", 400);
  }

  if (input.currency !== instrument.currency) {
    throw new ApiRequestError("VALIDATION_ERROR", "Transaction currency must match instrument currency.", 400);
  }

  const fee = parseDecimal(input.fee ?? "0", "fee", 6, false);
  const tax = parseDecimal(input.tax ?? "0", "tax", 6, false);

  switch (input.transactionType) {
    case "opening_position": {
      requireNonCashInstrument(instrument, input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      requireZero(tax, "tax", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: requiredDecimal(input.quantity, "quantity", 10, true),
        price: null,
        grossAmount: requiredDecimal(input.grossAmount, "grossAmount", 6, true),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    }
    case "opening_balance":
      requireCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      requireZero(tax, "tax", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: requiredDecimal(input.grossAmount, "grossAmount", 6, true),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "buy":
    case "sell": {
      requireNonCashInstrument(instrument, input.transactionType);

      if (clientSuppliedGrossAmount) {
        throw new ApiRequestError("VALIDATION_ERROR", "grossAmount is derived for buy and sell transactions.", 400);
      }

      const quantity = requiredDecimal(input.quantity, "quantity", 10, true);
      const price = requiredDecimal(input.price, "price", 10, true);
      const grossAmount = new Decimal(quantity).mul(price).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
      parseDecimal(grossAmount, "grossAmount", 6, true);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity,
        price,
        grossAmount,
        fee,
        tax,
        adjustmentDirection: null
      };
    }
    case "dividend":
      requireNonCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: requiredDecimal(input.grossAmount, "grossAmount", 6, true),
        fee: "0",
        tax,
        adjustmentDirection: null
      };
    case "deposit":
    case "withdrawal":
    case "interest":
      requireCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      requireZero(tax, "tax", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: requiredDecimal(input.grossAmount, "grossAmount", 6, true),
        fee: "0",
        tax: "0",
        adjustmentDirection: null
      };
    case "fee":
      requireCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      rejectValue(input.grossAmount, "grossAmount", input.transactionType);
      requireZero(tax, "tax", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: null,
        fee: requiredDecimal(input.fee, "fee", 6, true),
        tax: "0",
        adjustmentDirection: null
      };
    case "tax":
      requireCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      rejectValue(input.grossAmount, "grossAmount", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      rejectAdjustmentDirection(input);

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: null,
        fee: "0",
        tax: requiredDecimal(input.tax, "tax", 6, true),
        adjustmentDirection: null
      };
    case "adjustment":
      requireCashInstrument(instrument, input.transactionType);
      rejectValue(input.quantity, "quantity", input.transactionType);
      rejectValue(input.price, "price", input.transactionType);
      requireZero(fee, "fee", input.transactionType);
      requireZero(tax, "tax", input.transactionType);

      if (!input.adjustmentDirection) {
        throw new ApiRequestError("VALIDATION_ERROR", "adjustmentDirection is required for adjustment.", 400);
      }

      return {
        ...input,
        quantity: null,
        price: null,
        grossAmount: requiredDecimal(input.grossAmount, "grossAmount", 6, true),
        fee: "0",
        tax: "0"
      };
  }
}

function requireCashInstrument(instrument: Instrument, transactionType: TransactionType): void {
  if (instrument.assetType !== "cash") {
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      `${transactionType} transactions require a cash instrument.`,
      400
    );
  }
}

function requireNonCashInstrument(instrument: Instrument, transactionType: TransactionType): void {
  if (instrument.assetType === "cash") {
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      `${transactionType} transactions require a non-cash instrument.`,
      400
    );
  }
}

function rejectValue(value: string | null | undefined, field: string, transactionType: TransactionType): void {
  if (value !== undefined && value !== null) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is not allowed for ${transactionType}.`, 400);
  }
}

function requireZero(value: string, field: string, transactionType: TransactionType): void {
  if (!new Decimal(value).isZero()) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is not allowed for ${transactionType}.`, 400);
  }
}

function rejectAdjustmentDirection(input: CreateInvestmentTransactionInput): void {
  if (input.adjustmentDirection !== undefined && input.adjustmentDirection !== null) {
    throw new ApiRequestError("VALIDATION_ERROR", "adjustmentDirection is allowed only for adjustment.", 400);
  }
}

function toTransactionConstraintMessage(error: TransactionConstraintError): string {
  const constraint = error.constraint ?? "";

  if (constraint.includes("transactions_quantity_non_negative_check")) {
    return "quantity must be non-negative.";
  }

  if (constraint.includes("transactions_gross_amount_non_negative_check")) {
    return "grossAmount must be non-negative.";
  }

  return "Transaction data violates a database constraint.";
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  assertUuid(value, field);
  return value;
}

function assertUuid(value: string, field: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} id is invalid.`, 400);
  }
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a valid ISO date.`, 400);
  }

  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requiredDate(value, field);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function requiredDecimal(value: string | null | undefined, field: string, scale: number, positive: boolean): string {
  if (!value) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  return parseDecimal(value, field, scale, positive);
}

function parseDecimal(value: string, field: string, scale: number, positive: boolean): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a non-negative decimal string.`, 400);
  }

  const [integerPart, decimalPart = ""] = value.split(".");

  if (decimalPart.length > scale || integerPart.length > 28 - scale) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} exceeds supported precision.`, 400);
  }

  const parsed = new Decimal(value);

  if (positive && !parsed.gt(0)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be greater than zero.`, 400);
  }

  return parsed.toString();
}

function requiredEnum<T extends TransactionType | CurrencyCode>(
  value: unknown,
  allowedValues: readonly T[],
  field: string
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is invalid.`, 400);
  }

  return value as T;
}

function optionalEnum<T extends AdjustmentDirection>(
  value: unknown,
  allowedValues: readonly T[],
  field: string
): T | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is invalid.`, 400);
  }

  return value as T;
}
