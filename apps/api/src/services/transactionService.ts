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
  type PaginatedResult,
  type TransactionType,
  type UpdateInvestmentTransactionInput
} from "@family-ledger/shared";
import { findAccountById } from "../repositories/accountRepository";
import { findInstrumentById, listInstruments } from "../repositories/instrumentRepository";
import { findValuationRateToUsdOnDate } from "../repositories/fxRateRepository";
import {
  TransactionNotFoundError,
  TransactionConstraintError,
  TransactionReferenceError,
  createTransaction,
  deleteGeneratedCashLegByParentId,
  deleteTransaction,
  findGeneratedCashLegByParentId,
  findTransactionById,
  listTransactions,
  updateTransaction
} from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { recalculateSnapshotsFrom } from "./snapshotRecalculationService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxLimit = 200;
const defaultLimit = 50;

export async function getTransactions(
  query: Record<string, string | undefined> = {}
): Promise<PaginatedResult<InvestmentTransaction>> {
  if (!hasTransactionListQuery(query)) {
    const items = await listTransactions();
    return {
      items,
      pagination: {
        limit: items.length,
        offset: 0,
        hasMore: false
      }
    };
  }

  const from = optionalQueryDate("from", query.from);
  const to = optionalQueryDate("to", query.to);
  validateDateRange(from, to);

  const pagination = parsePagination(query);
  const transactionType = optionalTransactionType(query.transactionType);
  const transactionTypes = optionalTransactionTypes(query.transactionTypes);
  validateTransactionTypeFilters(transactionType, transactionTypes);

  const rows = await listTransactions({
    from,
    to,
    accountId: optionalUuid("accountId", query.accountId),
    instrumentId: optionalUuid("instrumentId", query.instrumentId),
    transactionType,
    transactionTypes,
    excludeGeneratedCashLegs: optionalBoolean("excludeGeneratedCashLegs", query.excludeGeneratedCashLegs),
    excludeCashInstruments: optionalBoolean("excludeCashInstruments", query.excludeCashInstruments),
    limit: pagination.limit,
    offset: pagination.offset
  });

  return {
    items: rows.slice(0, pagination.limit),
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: rows.length > pagination.limit
    }
  };
}

export async function createInvestmentTransaction(
  body: unknown,
  user: AuthenticatedUser
): Promise<InvestmentTransaction> {
  const record = asRecord(body);
  const input = parseCreateTransactionInput(record);
  const validated = await validateTransaction(input, "grossAmount" in record);

  try {
    const settlementInput = await withAutomaticSettlement(validated);
    const transaction = await createTransaction(settlementInput, user.id);
    await syncGeneratedCashLeg(transaction, user.id);
    await recalculateSnapshotsFrom(transaction.tradeDate);
    return transaction;
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
  rejectGeneratedCashLegMutation(existing);
  rejectTransactionTypeChange(patch, existing);

  const candidate: CreateInvestmentTransactionInput = {
    accountId: patch.accountId ?? existing.accountId,
    instrumentId: patch.instrumentId ?? existing.instrumentId,
    transactionType: existing.transactionType,
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
  const shouldUpdateDerivedData = isValuationImpactingPatch(patch);
  const updateInput = shouldUpdateDerivedData ? await withAutomaticSettlement(validated) : validated;

  try {
    const transaction = await updateTransaction(id, updateInput, user.id);

    if (shouldUpdateDerivedData) {
      await syncGeneratedCashLeg(transaction, user.id);
      await recalculateSnapshotsFrom(minDate(existing.tradeDate, transaction.tradeDate));
    }

    return transaction;
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
  const existing = await findTransactionById(id);

  if (!existing) {
    throw new ApiRequestError("NOT_FOUND", "Transaction was not found.", 404);
  }

  rejectGeneratedCashLegMutation(existing);

  try {
    await deleteGeneratedCashLegByParentId(id);
    await deleteTransaction(id);
    await recalculateSnapshotsFrom(existing.tradeDate);
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "Transaction was not found.", 404);
    }

    throw error;
  }
}

async function withAutomaticSettlement(
  input: CreateInvestmentTransactionInput
): Promise<CreateInvestmentTransactionInput> {
  if (input.transactionType !== "buy" && input.transactionType !== "sell") {
    return {
      ...input,
      settlementCurrency: null,
      settlementAmount: null
    };
  }

  const account = await findAccountById(input.accountId);

  if (!account) {
    throw new ApiRequestError("VALIDATION_ERROR", "Transaction account was not found.", 400);
  }

  const settlementCurrency = account.baseCurrency;
  await findCashInstrument(settlementCurrency);
  const tradeAmount = calculateTradeCashAmount(input);
  const settlementAmount = await convertSettlementAmount({
    amount: tradeAmount,
    fromCurrency: input.currency,
    toCurrency: settlementCurrency,
    tradeDate: input.tradeDate
  });

  return {
    ...input,
    settlementCurrency,
    settlementAmount
  };
}

async function syncGeneratedCashLeg(parent: InvestmentTransaction, userId: string): Promise<void> {
  const existingCashLeg = await findGeneratedCashLegByParentId(parent.id);

  if (parent.transactionType !== "buy" && parent.transactionType !== "sell") {
    if (existingCashLeg) {
      await deleteGeneratedCashLegByParentId(parent.id);
    }
    return;
  }

  if (!parent.settlementCurrency || !parent.settlementAmount) {
    throw new ApiRequestError("VALIDATION_ERROR", "Settlement cash amount could not be calculated.", 400);
  }

  const cashInstrument = await findCashInstrument(parent.settlementCurrency);
  const cashInput: CreateInvestmentTransactionInput = {
    accountId: parent.accountId,
    instrumentId: cashInstrument.id,
    transactionType: parent.transactionType === "buy" ? "withdrawal" : "deposit",
    tradeDate: parent.tradeDate,
    settlementDate: parent.settlementDate,
    quantity: null,
    price: null,
    grossAmount: parent.settlementAmount,
    fee: "0",
    tax: "0",
    currency: parent.settlementCurrency,
    adjustmentDirection: null,
    transactionSource: "generated_cash_leg",
    linkedTransactionId: parent.id,
    settlementCurrency: null,
    settlementAmount: null,
    notes: parent.transactionType === "buy" ? "自动现金流水：买入结算" : "自动现金流水：卖出结算"
  };

  if (existingCashLeg) {
    await updateTransaction(existingCashLeg.id, cashInput, userId);
    return;
  }

  await createTransaction(cashInput, userId);
}

async function findCashInstrument(currency: CurrencyCode): Promise<Instrument> {
  const instruments = await listInstruments();
  const cashInstrument = instruments.find((instrument) => instrument.assetType === "cash" && instrument.currency === currency);

  if (!cashInstrument) {
    throw new ApiRequestError("VALIDATION_ERROR", `No ${currency} cash instrument is configured.`, 400);
  }

  return cashInstrument;
}

function calculateTradeCashAmount(input: CreateInvestmentTransactionInput): Decimal {
  const grossAmount = requiredAmount(input.grossAmount, "grossAmount");
  const fee = new Decimal(input.fee ?? "0");
  const tax = new Decimal(input.tax ?? "0");
  const amount = input.transactionType === "sell" ? grossAmount.minus(fee).minus(tax) : grossAmount.plus(fee).plus(tax);

  if (!amount.gt(0)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Settlement amount must be greater than zero.", 400);
  }

  return amount;
}

function requiredAmount(value: string | null | undefined, field: string): Decimal {
  if (!value) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  return new Decimal(value);
}

async function convertSettlementAmount(input: {
  amount: Decimal;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  tradeDate: string;
}): Promise<string> {
  if (input.fromCurrency === input.toCurrency) {
    return input.amount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
  }

  const [fromRate, toRate] = await Promise.all([
    findValuationRateToUsdOnDate(input.fromCurrency, input.tradeDate),
    findValuationRateToUsdOnDate(input.toCurrency, input.tradeDate)
  ]);

  if (!fromRate || !toRate) {
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      `Missing valuation FX rate for ${input.fromCurrency}/${input.toCurrency} on or before ${input.tradeDate}.`,
      400
    );
  }

  return input.amount
    .times(fromRate.rate)
    .dividedBy(toRate.rate)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toFixed(6);
}

function rejectGeneratedCashLegMutation(transaction: InvestmentTransaction): void {
  if (transaction.transactionSource === "generated_cash_leg") {
    throw new ApiRequestError("VALIDATION_ERROR", "Generated cash transactions must be changed through the parent trade.", 400);
  }
}

function rejectTransactionTypeChange(
  patch: UpdateInvestmentTransactionInput,
  existing: InvestmentTransaction
): void {
  if (patch.transactionType !== undefined && patch.transactionType !== existing.transactionType) {
    throw new ApiRequestError("VALIDATION_ERROR", "Transaction type cannot be changed. Delete and recreate the transaction instead.", 400);
  }
}

function isValuationImpactingPatch(input: UpdateInvestmentTransactionInput): boolean {
  return [
    "accountId",
    "instrumentId",
    "tradeDate",
    "settlementDate",
    "quantity",
    "price",
    "grossAmount",
    "fee",
    "tax",
    "currency",
    "adjustmentDirection"
  ].some((field) => field in input);
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function hasTransactionListQuery(query: Record<string, string | undefined>): boolean {
  return [
    "from",
    "to",
    "accountId",
    "instrumentId",
    "transactionType",
    "transactionTypes",
    "excludeGeneratedCashLegs",
    "excludeCashInstruments",
    "limit",
    "offset"
  ].some((key) => Boolean(query[key]));
}

function optionalQueryDate(name: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!datePattern.test(value) || !isIsoDate(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must use YYYY-MM-DD format.`, 400);
  }

  return value;
}

function validateDateRange(from: string | undefined, to: string | undefined): void {
  if (from && to && from > to) {
    throw new ApiRequestError("VALIDATION_ERROR", "from cannot be after to.", 400);
  }
}

function optionalUuid(name: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  assertUuid(value, name);
  return value;
}

function optionalTransactionType(value: string | undefined): TransactionType | undefined {
  if (!value) {
    return undefined;
  }

  if (!TRANSACTION_TYPES.includes(value as TransactionType)) {
    throw new ApiRequestError("VALIDATION_ERROR", "transactionType is invalid.", 400);
  }

  return value as TransactionType;
}

function optionalTransactionTypes(value: string | undefined): TransactionType[] | undefined {
  if (!value) {
    return undefined;
  }

  const transactionTypes = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (transactionTypes.length === 0) {
    return undefined;
  }

  for (const transactionType of transactionTypes) {
    if (!TRANSACTION_TYPES.includes(transactionType as TransactionType)) {
      throw new ApiRequestError("VALIDATION_ERROR", "transactionTypes contains an invalid transaction type.", 400);
    }
  }

  return [...new Set(transactionTypes)] as TransactionType[];
}

function validateTransactionTypeFilters(
  transactionType: TransactionType | undefined,
  transactionTypes: TransactionType[] | undefined
): void {
  if (transactionType && transactionTypes && !transactionTypes.includes(transactionType)) {
    throw new ApiRequestError(
      "VALIDATION_ERROR",
      "transactionType must be included in transactionTypes when both filters are supplied.",
      400
    );
  }
}

function optionalBoolean(name: string, value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  if (value !== "true" && value !== "false") {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must be true or false.`, 400);
  }

  return value === "true";
}

function parsePagination(query: Record<string, string | undefined>): { limit: number; offset: number } {
  return {
    limit: parseLimit(query.limit),
    offset: parseOffset(query.offset)
  };
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return defaultLimit;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiRequestError("VALIDATION_ERROR", `limit must be an integer between 1 and ${maxLimit}.`, 400);
  }

  return limit;
}

function parseOffset(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const offset = Number(value);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "offset must be a non-negative integer.", 400);
  }

  return offset;
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
