export type ScheduledJobLogStatus = "started" | "succeeded" | "failed" | "not_implemented";

export interface ScheduledJobLogInput {
  jobName: string;
  eventId: string;
  eventTime: string;
  status: ScheduledJobLogStatus;
  jobRunId?: string;
  recordsInserted?: number;
  recordsSkipped?: number;
  errorMessage?: string;
}

export function logScheduledJob(input: ScheduledJobLogInput): void {
  const payload = withoutUndefined({
    jobName: input.jobName,
    eventId: input.eventId,
    eventTime: input.eventTime,
    status: input.status,
    jobRunId: input.jobRunId,
    recordsInserted: input.recordsInserted,
    recordsSkipped: input.recordsSkipped,
    errorMessage: input.errorMessage
  });

  if (input.status === "failed") {
    console.error(payload);
    return;
  }

  console.log(payload);
}

export function sanitizeScheduledJobError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown scheduled job error.";
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
