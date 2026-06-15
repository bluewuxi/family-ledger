import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { formatDateTimeInTimeZone, getAppBusinessDate, getAppBusinessDayEndInstant } from "@family-ledger/shared";
import { createGeneratePortfolioSnapshotsHandler } from "../apps/jobs/src/handlers/generatePortfolioSnapshots";
import { formatHoursMinutes } from "../apps/web/src/lib/timeFormat";
import { buildProfitChartData, buildTrendChartData } from "../apps/web/src/lib/trendChartData";

void main();

async function main(): Promise<void> {
  assert.equal(getAppBusinessDate("2026-05-27T21:59:59.000Z"), "2026-05-27");
  assert.equal(getAppBusinessDate("2026-05-27T22:00:00.000Z"), "2026-05-28");
  assert.equal(getAppBusinessDate("2026-05-28T01:30:00.000Z"), "2026-05-28");
  assert.equal(getAppBusinessDayEndInstant("2026-05-27T21:59:59.000Z"), "2026-05-27T22:00:00.000Z");
  assert.equal(getAppBusinessDayEndInstant("2026-05-27T22:00:00.000Z"), "2026-05-28T22:00:00.000Z");

  const timestamp = "2026-05-28T00:30:00.000Z";
  const shanghaiTime = formatDateTimeInTimeZone(timestamp, "Asia/Shanghai");
  const aucklandTime = formatDateTimeInTimeZone(timestamp, "Pacific/Auckland");
  assert.notEqual(shanghaiTime, aucklandTime);

  const template = readFileSync("infra/aws/template.yaml", "utf8");
  assert.match(template, /Type: AWS::Scheduler::Schedule/u);
  assert.match(template, /ScheduleExpressionTimezone: !Ref ScheduledJobsTimezone/u);
  assert.match(template, /FlexibleTimeWindow:\s*\r?\n\s*Mode: "OFF"/u);
  assert.match(template, /Default: "cron\(5 6 \? \* TUE-SAT \*\)"/u);
  assert.match(template, /Default: "cron\(10 6 \? \* TUE-SAT \*\)"/u);
  assert.match(template, /Default: "cron\(30 6 \? \* TUE-SAT \*\)"/u);
  assert.match(template, /<aws\.scheduler\.scheduled-time>/u);
  assert.match(template, /<aws\.scheduler\.execution-id>/u);
  assert.doesNotMatch(template, /Type: AWS::Events::Rule/u);

  const dashboard = readFileSync("apps/web/src/pages/DashboardPage.tsx", "utf8");
  assert.match(dashboard, /行情变动/u);
  assert.doesNotMatch(dashboard, /本交易日/u);
  assert.doesNotMatch(dashboard, /今日变动/u);
  assert.equal(formatHoursMinutes(201), "03小时 21分");

  const timeFormat = readFileSync("apps/web/src/lib/timeFormat.ts", "utf8");
  assert.match(timeFormat, /交易日/u);

  const layout = readFileSync("apps/web/src/components/Layout.tsx", "utf8");
  assert.doesNotMatch(layout, /<time/u);
  assert.doesNotMatch(layout, /setInterval\(.*60_000/u);

  const aShareOpenTime = "2026-05-29T02:18:00.000Z";
  const sameDayLiveChart = buildTrendChartData(
    [{ date: "2026-05-29", portfolioValue: 100, totalInvestment: null }],
    "110",
    "2026-05-29",
    aShareOpenTime
  );
  assert.equal(sameDayLiveChart.length, 3);
  assert.equal(sameDayLiveChart[0]?.date, "2026-05-29");
  assert.equal(sameDayLiveChart[0]?.snapshotValue, 100);
  assert.equal(sameDayLiveChart[0]?.liveValue, 100);
  assert.equal(sameDayLiveChart[2]?.date, "__live_endpoint__2026-05-29");
  assert.equal(sameDayLiveChart[2]?.liveValue, 110);

  const previousDayLiveChart = buildTrendChartData(
    [{ date: "2026-05-28", portfolioValue: 100, totalInvestment: null }],
    "110",
    "2026-05-29",
    aShareOpenTime
  );
  assert.equal(previousDayLiveChart.at(-1)?.date, "2026-05-29");
  assert.equal(previousDayLiveChart.at(-1)?.liveValue, 110);

  const sampledRangeLiveChart = buildTrendChartData(
    [{ date: "2026-05-28", portfolioValue: 100, totalInvestment: null }],
    "110",
    "2026-05-29",
    aShareOpenTime,
    { showLiveConnector: false }
  );
  assert.deepEqual(sampledRangeLiveChart, [
    {
      date: "2026-05-28",
      value: 100,
      snapshotValue: 100,
      liveValue: null,
      totalInvestment: null,
      snapshotDate: null
    },
    {
      date: "2026-05-29",
      value: 110,
      snapshotValue: 110,
      liveValue: null,
      totalInvestment: null
    }
  ]);

  const profitChart = buildProfitChartData([
    {
      date: "2026-05-28",
      value: 100,
      snapshotValue: 100,
      liveValue: null,
      totalInvestment: 80,
      snapshotDate: "2026-05-28"
    },
    {
      date: "2026-05-29",
      value: 110,
      snapshotValue: 110,
      liveValue: null,
      totalInvestment: null,
      snapshotDate: "2026-05-29"
    },
    {
      date: "2026-05-30",
      value: 140,
      snapshotValue: 140,
      liveValue: null,
      totalInvestment: 120,
      snapshotDate: "2026-05-30"
    }
  ]);
  assert.deepEqual(profitChart.map((point) => [point.date, point.profitValue]), [
    ["2026-05-28", 20],
    ["2026-05-29", 30],
    ["2026-05-30", 20]
  ]);

  const staleQuoteChart = buildTrendChartData(
    [{ date: "2026-05-28", portfolioValue: 100, totalInvestment: null }],
    "110",
    "2026-05-28",
    aShareOpenTime
  );
  assert.deepEqual(staleQuoteChart, [
    {
      date: "2026-05-28",
      value: 100,
      snapshotValue: 100,
      liveValue: null,
      totalInvestment: null,
      snapshotDate: null
    }
  ]);

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

  await withMutedConsole(() => handler({ id: "derived-date", time: "2026-05-27T21:59:59.000Z" }));
  assert.equal(generatedSnapshotDate, "2026-05-27");

  await withMutedConsole(() => handler({ id: "derived-new-date", time: "2026-05-27T22:00:00.000Z" }));
  assert.equal(generatedSnapshotDate, "2026-05-28");

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
