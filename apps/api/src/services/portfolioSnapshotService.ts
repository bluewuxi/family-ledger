import { getAppBusinessDate, type AuthenticatedUser, type PortfolioSnapshotSummary } from "@family-ledger/shared";
import { listPortfolioSnapshots } from "../repositories/portfolioSnapshotRepository";
import { ApiRequestError } from "../utils/apiError";
import { resolveReportingCurrency } from "./reportingCurrencyService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function getPortfolioSnapshots(input: {
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotSummary[]> {
  const currency = await resolveReportingCurrency(input);
  const today = getAppBusinessDate();
  const to = input.to ?? today;
  const limit = optionalLimit(input.limit);
  const order = optionalOrder(input.order);
  const latestMode = limit !== undefined && input.from === undefined;
  const from = input.from ?? (latestMode ? "0001-01-01" : to);

  validateDate("from", from);
  validateDate("to", to);

  if (from > to) {
    throw new ApiRequestError("VALIDATION_ERROR", "from cannot be after to.", 400);
  }

  return listPortfolioSnapshots({ from, to, currency, limit, order: order ?? "asc" });
}

function validateDate(name: string, value: string): void {
  if (!datePattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must use YYYY-MM-DD format.`, 400);
  }
}

function optionalLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new ApiRequestError("VALIDATION_ERROR", "limit must be an integer between 1 and 200.", 400);
  }

  return limit;
}

function optionalOrder(value: string | undefined): "asc" | "desc" | undefined {
  if (!value) {
    return undefined;
  }

  if (value !== "asc" && value !== "desc") {
    throw new ApiRequestError("VALIDATION_ERROR", "order must be asc or desc.", 400);
  }

  return value;
}
