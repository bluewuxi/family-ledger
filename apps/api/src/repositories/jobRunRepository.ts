import type { DataKind, DataProviderRun, JobRun, JobRunStatus, JobTriggerSource } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface JobRunRow {
  id: string;
  job_name: string;
  status: JobRunStatus;
  trigger_source: JobTriggerSource;
  triggered_by_user_id: string | null;
  trigger_request_id: string | null;
  job_started_at: string;
  job_finished_at: string | null;
  records_inserted: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface DataProviderRunRow {
  id: string;
  job_run_id: string;
  provider: string;
  data_kind: DataKind;
  status: JobRunStatus;
  provider_started_at: string;
  provider_finished_at: string | null;
  records_inserted: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface FinishRunInput {
  status: Extract<JobRunStatus, "succeeded" | "failed">;
  finishedAt: string;
  recordsInserted?: number;
  recordsSkipped?: number;
  errorMessage?: string | null;
}

export async function createJobRun(input: {
  jobName: string;
  jobStartedAt: string;
  triggerSource?: JobTriggerSource;
  triggeredByUserId?: string | null;
  triggerRequestId?: string | null;
}): Promise<JobRun> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("job_runs")
    .insert({
      job_name: input.jobName,
      status: "started",
      trigger_source: input.triggerSource ?? "schedule",
      triggered_by_user_id: input.triggeredByUserId ?? null,
      trigger_request_id: input.triggerRequestId ?? null,
      job_started_at: input.jobStartedAt
    })
    .select(jobRunSelect)
    .single<JobRunRow>();

  if (error) {
    throw new Error("Failed to create job run.");
  }

  return mapJobRunRow(data);
}

export async function finishJobRun(id: string, input: FinishRunInput): Promise<JobRun> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("job_runs")
    .update({
      status: input.status,
      job_finished_at: input.finishedAt,
      records_inserted: input.recordsInserted ?? 0,
      records_skipped: input.recordsSkipped ?? 0,
      error_message: input.errorMessage ?? null
    })
    .eq("id", id)
    .select(jobRunSelect)
    .maybeSingle<JobRunRow>();

  if (error || !data) {
    throw new Error("Failed to finish job run.");
  }

  return mapJobRunRow(data);
}

export async function createDataProviderRun(input: {
  jobRunId: string;
  provider: string;
  dataKind: DataKind;
  providerStartedAt: string;
}): Promise<DataProviderRun> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("data_provider_runs")
    .insert({
      job_run_id: input.jobRunId,
      provider: input.provider,
      data_kind: input.dataKind,
      status: "started",
      provider_started_at: input.providerStartedAt
    })
    .select(dataProviderRunSelect)
    .single<DataProviderRunRow>();

  if (error) {
    throw new Error("Failed to create data provider run.");
  }

  return mapDataProviderRunRow(data);
}

export async function finishDataProviderRun(id: string, input: FinishRunInput): Promise<DataProviderRun> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("data_provider_runs")
    .update({
      status: input.status,
      provider_finished_at: input.finishedAt,
      records_inserted: input.recordsInserted ?? 0,
      records_skipped: input.recordsSkipped ?? 0,
      error_message: input.errorMessage ?? null
    })
    .eq("id", id)
    .select(dataProviderRunSelect)
    .maybeSingle<DataProviderRunRow>();

  if (error || !data) {
    throw new Error("Failed to finish data provider run.");
  }

  return mapDataProviderRunRow(data);
}

const jobRunSelect = [
  "id",
  "job_name",
  "status",
  "trigger_source",
  "triggered_by_user_id",
  "trigger_request_id",
  "job_started_at",
  "job_finished_at",
  "records_inserted",
  "records_skipped",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

const dataProviderRunSelect = [
  "id",
  "job_run_id",
  "provider",
  "data_kind",
  "status",
  "provider_started_at",
  "provider_finished_at",
  "records_inserted",
  "records_skipped",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

function mapJobRunRow(row: JobRunRow): JobRun {
  return {
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    triggerSource: row.trigger_source,
    triggeredByUserId: row.triggered_by_user_id,
    triggerRequestId: row.trigger_request_id,
    jobStartedAt: row.job_started_at,
    jobFinishedAt: row.job_finished_at,
    recordsInserted: row.records_inserted,
    recordsSkipped: row.records_skipped,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDataProviderRunRow(row: DataProviderRunRow): DataProviderRun {
  return {
    id: row.id,
    jobRunId: row.job_run_id,
    provider: row.provider,
    dataKind: row.data_kind,
    status: row.status,
    providerStartedAt: row.provider_started_at,
    providerFinishedAt: row.provider_finished_at,
    recordsInserted: row.records_inserted,
    recordsSkipped: row.records_skipped,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
