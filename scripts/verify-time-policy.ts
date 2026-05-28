import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { formatDateTimeInTimeZone, getAppBusinessDate } from "@family-ledger/shared";
import { createGeneratePortfolioSnapshotsHandler } from "../apps/jobs/src/handlers/generatePortfolioSnapshots";

void main();

async function main(): Promise<void> {
  assert.equal(getAppBusinessDate("2026-05-28T00:59:59.000Z"), "2026-05-27");
  assert.equal(getAppBusinessDate("2026-05-28T01:00:00.000Z"), "2026-05-28");
  assert.equal(getAppBusinessDate("2026-05-28T01:30:00.000Z"), "2026-05-28");

  const timestamp = "2026-05-28T00:30:00.000Z";
  const shanghaiTime = formatDateTimeInTimeZone(timestamp, "Asia/Shanghai");
  const aucklandTime = formatDateTimeInTimeZone(timestamp, "Pacific/Auckland");
  assert.notEqual(shanghaiTime, aucklandTime);

  const template = readFileSync("infra/aws/template.yaml", "utf8");
  assert.match(template, /Type: AWS::Scheduler::Schedule/u);
  assert.match(template, /ScheduleExpressionTimezone: !Ref ScheduledJobsTimezone/u);
  assert.match(template, /FlexibleTimeWindow:\s*\r?\n\s*Mode: "OFF"/u);
  assert.match(template, /<aws\.scheduler\.scheduled-time>/u);
  assert.match(template, /<aws\.scheduler\.execution-id>/u);
  assert.doesNotMatch(template, /Type: AWS::Events::Rule/u);

  const dashboard = readFileSync("apps/web/src/pages/DashboardPage.tsx", "utf8");
  assert.match(dashboard, /最新变动/u);
  assert.doesNotMatch(dashboard, /今日变动/u);

  let generatedSnapshotDate: string | null = null;
  const handler = createGeneratePortfolioSnapshotsHandler({
    generatePortfolioSnapshot: async (input) => {
      generatedSnapshotDate = input.snapshotDate;
      return {
        jobRun: {
          id: "job-run",
          jobName: "generate-portfolio-snapshots",
          status: "succeeded",
          triggerSource: "schedule",
          triggeredByUserId: null,
          triggerRequestId: null,
          jobStartedAt: input.startedAt ?? timestamp,
          jobFinishedAt: timestamp,
          recordsInserted: 1,
          recordsSkipped: 0,
          errorMessage: null,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        snapshotId: "snapshot",
        snapshotDate: input.snapshotDate,
        accountsWritten: 0,
        valuation: {
          snapshotDate: input.snapshotDate,
          marketValueUsd: null,
          costUsd: null,
          unrealizedGainUsd: null,
          dailyChangeUsd: null,
          dailyChangePct: null,
          usdToNzdRate: "0",
          usdToCnyRate: "0",
          warnings: [],
          accounts: []
        }
      };
    }
  });

  await withMutedConsole(() =>
    handler({ id: "manual-date", time: "2026-05-28T00:30:00.000Z", detail: { snapshotDate: "2026-05-20" } })
  );
  assert.equal(generatedSnapshotDate, "2026-05-20");

  await withMutedConsole(() => handler({ id: "derived-date", time: "2026-05-28T00:59:59.000Z" }));
  assert.equal(generatedSnapshotDate, "2026-05-27");

  console.log("Time policy verification: success");
}

async function withMutedConsole(action: () => Promise<void>): Promise<void> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    await action();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
