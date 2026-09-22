import { ACCOUNT_PURPOSES, type AccountPurpose } from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";

export function optionalAccountPurpose(value: string | undefined): AccountPurpose | undefined {
  if (value === undefined) return undefined;
  if (!ACCOUNT_PURPOSES.includes(value as AccountPurpose)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Invalid account purpose.", 400);
  }
  return value as AccountPurpose;
}
