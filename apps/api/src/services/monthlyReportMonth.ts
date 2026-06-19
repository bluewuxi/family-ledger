import { getAppBusinessDate } from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";

const monthPattern = /^\d{4}-\d{2}$/;

export function parseMonthlyReportMonth(value: string | undefined, maxMonth = getAppBusinessDate().slice(0, 7)): string {
  if (!value || !monthPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must use YYYY-MM format.", 400);
  }

  const date = new Date(`${value}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== value) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must be a valid calendar month.", 400);
  }

  if (value > maxMonth) {
    throw new ApiRequestError("VALIDATION_ERROR", "不能查看未来月份的月度回顾。", 400);
  }

  return value;
}
