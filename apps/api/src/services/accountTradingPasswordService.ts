import { createHash, timingSafeEqual } from "node:crypto";
import {
  deleteSecureParameter,
  getParameter,
  getSecureParameter,
  isSsmParameterNotFound,
  putSecureParameter,
  putStringParameter
} from "../config/ssm";
import { findAccountById } from "../repositories/accountRepository";
import { ApiRequestError } from "../utils/apiError";

export const TRADING_PASSWORD_PLACEHOLDER = "尚未设置交易密码";
export const TRADING_PASSWORD_GATE_EMPTY_VALUE = "empty";

export async function createTradingPasswordPlaceholder(accountId: string): Promise<void> {
  await putSecureParameter(getTradingPasswordParameterName(accountId), TRADING_PASSWORD_PLACEHOLDER, false);
}

export async function deleteTradingPasswordParameter(accountId: string): Promise<void> {
  try {
    await deleteSecureParameter(getTradingPasswordParameterName(accountId));
  } catch (error) {
    if (isSsmParameterNotFound(error)) {
      return;
    }

    throw error;
  }
}

export async function revealTradingPassword(
  accountId: string,
  body: unknown
): Promise<{ tradingPassword: string }> {
  assertUuid(accountId);
  await assertAccountExists(accountId);
  const extraPassword = parseExtraPasswordBody(body);
  await assertExtraPasswordMatches(extraPassword);

  try {
    return {
      tradingPassword: await getSecureParameter(getTradingPasswordParameterName(accountId))
    };
  } catch (error) {
    if (isSsmParameterNotFound(error)) {
      throw new Error("Trading password parameter is missing.");
    }

    throw error;
  }
}

export async function updateTradingPassword(
  accountId: string,
  body: unknown
): Promise<{ updated: true }> {
  assertUuid(accountId);
  await assertAccountExists(accountId);
  const { extraPassword, tradingPassword } = parseUpdateTradingPasswordBody(body);
  await assertExtraPasswordMatches(extraPassword);
  await putSecureParameter(getTradingPasswordParameterName(accountId), tradingPassword, true);
  return { updated: true };
}

export async function getTradingPasswordGateStatus(): Promise<{ isInitialized: boolean }> {
  const gateValue = await getOrCreateTradingPasswordGateValue();
  return { isInitialized: gateValue !== TRADING_PASSWORD_GATE_EMPTY_VALUE };
}

export async function updateTradingPasswordGate(body: unknown): Promise<{ isInitialized: true }> {
  const { currentExtraPassword, newExtraPassword } = parseUpdateTradingPasswordGateBody(body);
  const gateValue = await getOrCreateTradingPasswordGateValue();

  if (gateValue !== TRADING_PASSWORD_GATE_EMPTY_VALUE) {
    if (!currentExtraPassword) {
      throw new ApiRequestError("VALIDATION_ERROR", "currentExtraPassword is required.", 400);
    }

    assertMd5PasswordMatches(currentExtraPassword, gateValue);
  }

  await putStringParameter(getTradingPasswordGateParameterName(), createGateSignature(newExtraPassword), true);
  return { isInitialized: true };
}

export function getTradingPasswordParameterName(accountId: string): string {
  const prefix = process.env.TRADING_PASSWORD_SSM_PREFIX;

  if (!prefix) {
    throw new Error("TRADING_PASSWORD_SSM_PREFIX is required.");
  }

  return `${prefix}${accountId}`;
}

export async function assertExtraPasswordMatches(extraPassword: string): Promise<void> {
  const expectedSignature = await getOrCreateTradingPasswordGateValue();

  if (expectedSignature === TRADING_PASSWORD_GATE_EMPTY_VALUE) {
    return;
  }

  assertMd5PasswordMatches(extraPassword, expectedSignature);
}

export function createGateSignature(extraPassword: string): string {
  return createHash("md5").update(extraPassword, "utf8").digest("hex");
}

async function getOrCreateTradingPasswordGateValue(): Promise<string> {
  try {
    return normalizeGateValue(await getParameter(getTradingPasswordGateParameterName()));
  } catch (error) {
    if (!isSsmParameterNotFound(error)) {
      throw error;
    }

    await putStringParameter(getTradingPasswordGateParameterName(), TRADING_PASSWORD_GATE_EMPTY_VALUE, false);
    return TRADING_PASSWORD_GATE_EMPTY_VALUE;
  }
}

function assertMd5PasswordMatches(extraPassword: string, expectedSignature: string): void {
  const normalizedExpectedSignature = normalizeGateValue(expectedSignature);
  const actualSignature = createGateSignature(extraPassword);

  if (!secureEqual(normalizedExpectedSignature, actualSignature)) {
    throw new ApiRequestError("FORBIDDEN", "Extra password is incorrect.", 403);
  }
}

function getTradingPasswordGateParameterName(): string {
  const parameterName = process.env.TRADING_PASSWORD_GATE_SSM_PARAM ?? process.env.TRADING_PASSWORD_GATE_SIGNATURE_SSM_PARAM;

  if (!parameterName) {
    throw new Error("TRADING_PASSWORD_GATE_SSM_PARAM is required.");
  }

  return parameterName;
}

async function assertAccountExists(accountId: string): Promise<void> {
  const account = await findAccountById(accountId);

  if (!account) {
    throw new ApiRequestError("NOT_FOUND", "Account was not found.", 404);
  }
}

function parseExtraPasswordBody(body: unknown): string {
  const record = asRecord(body);
  return requiredNonEmptyString(record.extraPassword, "extraPassword");
}

function parseUpdateTradingPasswordBody(body: unknown): { extraPassword: string; tradingPassword: string } {
  const record = asRecord(body);
  return {
    extraPassword: requiredNonEmptyString(record.extraPassword, "extraPassword"),
    tradingPassword: requiredNonEmptyString(record.tradingPassword, "tradingPassword")
  };
}

function parseUpdateTradingPasswordGateBody(body: unknown): { currentExtraPassword: string | null; newExtraPassword: string } {
  const record = asRecord(body);
  return {
    currentExtraPassword: optionalString(record.currentExtraPassword, "currentExtraPassword"),
    newExtraPassword: requiredNonEmptyString(record.newExtraPassword, "newExtraPassword")
  };
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requiredNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  if (!value.trim()) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} cannot be empty.`, 400);
  }

  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a string.`, 400);
  }

  return value.trim() ? value : null;
}

function normalizeGateValue(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === TRADING_PASSWORD_GATE_EMPTY_VALUE) {
    return normalized;
  }

  if (!/^[a-f0-9]{32}$/u.test(normalized)) {
    throw new Error("Trading password gate signature SSM parameter is invalid.");
  }

  return normalized;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function assertUuid(id: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

  if (!uuidPattern.test(id)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Account id is invalid.", 400);
  }
}
