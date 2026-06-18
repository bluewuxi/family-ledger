import type {
  AuthenticatedUser,
  MonthlyReview,
  MonthlyReviewStatus,
  UpdateMonthlyReviewInput
} from "@family-ledger/shared";
import { MONTHLY_REVIEW_STATUSES } from "@family-ledger/shared";
import { findMonthlyReview, saveMonthlyReviewRecord } from "../repositories/monthlyReviewRepository";
import { ApiRequestError } from "../utils/apiError";

const monthPattern = /^\d{4}-\d{2}$/;
const maxFamilyNotesLength = 12000;

export async function getMonthlyReview(monthInput: string | undefined): Promise<MonthlyReview> {
  const month = parseMonth(monthInput);
  const review = await findMonthlyReview(month);
  return review ?? createEmptyMonthlyReview(month);
}

export async function updateMonthlyReview(
  monthInput: string | undefined,
  body: unknown,
  user: AuthenticatedUser
): Promise<MonthlyReview> {
  const month = parseMonth(monthInput);
  const input = parseUpdateMonthlyReviewInput(body);
  const existing = await findMonthlyReview(month);
  const nextStatus = input.reviewStatus ?? existing?.reviewStatus ?? "in_progress";
  const completionFields = resolveCompletionFields(nextStatus, input.reviewStatus, existing, user);

  return saveMonthlyReviewRecord(month, {
    familyNotes: input.familyNotes ?? existing?.familyNotes ?? "",
    reviewStatus: nextStatus,
    completedAt: completionFields.completedAt,
    completedByUserId: completionFields.completedByUserId,
    updatedByUserId: user.id
  });
}

function parseUpdateMonthlyReviewInput(body: unknown): UpdateMonthlyReviewInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be an object.", 400);
  }

  const input: UpdateMonthlyReviewInput = {};
  const record = body as { familyNotes?: unknown; reviewStatus?: unknown };

  if ("familyNotes" in record) {
    input.familyNotes = optionalFamilyNotes(record.familyNotes);
  }

  if ("reviewStatus" in record) {
    input.reviewStatus = requiredReviewStatus(record.reviewStatus);
  }

  return input;
}

function parseMonth(value: string | undefined): string {
  if (!value || !monthPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must use YYYY-MM format.", 400);
  }

  const date = new Date(`${value}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== value) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must be a valid calendar month.", 400);
  }

  return value;
}

function optionalFamilyNotes(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "string") {
    throw new ApiRequestError("VALIDATION_ERROR", "familyNotes must be a string.", 400);
  }

  if (value.length > maxFamilyNotesLength) {
    throw new ApiRequestError("VALIDATION_ERROR", "familyNotes is too long.", 400);
  }

  return value;
}

function requiredReviewStatus(value: unknown): MonthlyReviewStatus {
  if (!MONTHLY_REVIEW_STATUSES.includes(value as MonthlyReviewStatus)) {
    throw new ApiRequestError("VALIDATION_ERROR", "reviewStatus must be in_progress or complete.", 400);
  }

  return value as MonthlyReviewStatus;
}

function resolveCompletionFields(
  nextStatus: MonthlyReviewStatus,
  requestedStatus: MonthlyReviewStatus | undefined,
  existing: MonthlyReview | null,
  user: AuthenticatedUser
): { completedAt: string | null; completedByUserId: string | null } {
  if (nextStatus === "in_progress") {
    return { completedAt: null, completedByUserId: null };
  }

  if (requestedStatus === "complete" && existing?.reviewStatus !== "complete") {
    return { completedAt: new Date().toISOString(), completedByUserId: user.id };
  }

  return {
    completedAt: existing?.completedAt ?? new Date().toISOString(),
    completedByUserId: existing?.completedByUserId ?? user.id
  };
}

function createEmptyMonthlyReview(month: string): MonthlyReview {
  return {
    month,
    familyNotes: "",
    reviewStatus: "in_progress",
    completedAt: null,
    completedByUserId: null,
    updatedByUserId: null,
    createdAt: null,
    updatedAt: null
  };
}
