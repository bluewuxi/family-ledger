import type { AuthenticatedUser, PortfolioSnapshotSummary } from "@family-ledger/shared";
import { listPortfolioSnapshots } from "../repositories/portfolioSnapshotRepository";
import { ApiRequestError } from "../utils/apiError";
import { resolveReportingCurrency } from "./reportingCurrencyService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function getPortfolioSnapshots(input: {
  from?: string;
  to?: string;
  currency?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotSummary[]> {
  const currency = await resolveReportingCurrency(input);
  const today = new Date().toISOString().slice(0, 10);
  const to = input.to ?? today;
  const from = input.from ?? to;

  validateDate("from", from);
  validateDate("to", to);

  if (from > to) {
    throw new ApiRequestError("VALIDATION_ERROR", "from cannot be after to.", 400);
  }

  return listPortfolioSnapshots({ from, to, currency });
}

function validateDate(name: string, value: string): void {
  if (!datePattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must use YYYY-MM-DD format.`, 400);
  }
}
