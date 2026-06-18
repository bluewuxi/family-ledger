import type { MonthlyReview, MonthlyReviewStatus } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface MonthlyReviewRow {
  month: string;
  family_notes: string;
  review_status: MonthlyReviewStatus;
  completed_at: string | null;
  completed_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveMonthlyReviewRecordInput {
  familyNotes: string;
  reviewStatus: MonthlyReviewStatus;
  completedAt: string | null;
  completedByUserId: string | null;
  updatedByUserId: string;
}

export async function findMonthlyReview(month: string): Promise<MonthlyReview | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("monthly_reviews")
    .select(monthlyReviewSelect)
    .eq("month", month)
    .maybeSingle<MonthlyReviewRow>();

  if (error) {
    throw new Error("Failed to load monthly review.");
  }

  return data ? mapMonthlyReviewRow(data) : null;
}

export async function saveMonthlyReviewRecord(
  month: string,
  input: SaveMonthlyReviewRecordInput
): Promise<MonthlyReview> {
  const supabase = await getSupabaseAdmin();
  const existing = await findMonthlyReview(month);

  if (existing) {
    const { data, error } = await supabase
      .from("monthly_reviews")
      .update({
        family_notes: input.familyNotes,
        review_status: input.reviewStatus,
        completed_at: input.completedAt,
        completed_by_user_id: input.completedByUserId,
        updated_by_user_id: input.updatedByUserId
      })
      .eq("month", month)
      .select(monthlyReviewSelect)
      .single<MonthlyReviewRow>();

    if (error) {
      throw new Error("Failed to update monthly review.");
    }

    return mapMonthlyReviewRow(data);
  }

  const { data, error } = await supabase
    .from("monthly_reviews")
    .insert({
      month,
      family_notes: input.familyNotes,
      review_status: input.reviewStatus,
      completed_at: input.completedAt,
      completed_by_user_id: input.completedByUserId,
      updated_by_user_id: input.updatedByUserId
    })
    .select(monthlyReviewSelect)
    .single<MonthlyReviewRow>();

  if (error) {
    throw new Error("Failed to create monthly review.");
  }

  return mapMonthlyReviewRow(data);
}

const monthlyReviewSelect = [
  "month",
  "family_notes",
  "review_status",
  "completed_at",
  "completed_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

function mapMonthlyReviewRow(row: MonthlyReviewRow): MonthlyReview {
  return {
    month: row.month,
    familyNotes: row.family_notes,
    reviewStatus: row.review_status,
    completedAt: row.completed_at,
    completedByUserId: row.completed_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
