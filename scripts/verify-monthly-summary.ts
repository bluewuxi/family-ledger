import { strict as assert } from "node:assert";
import {
  calculateMonthlyBridge,
  getMonthlySnapshotWindows
} from "../apps/api/src/services/monthlySummaryService";

const complete = calculateMonthlyBridge({
  startValue: "1000.000000",
  endValue: "1300.000000",
  netPrincipalFlow: "200.000000",
  cashAdjustmentImpact: "-10.000000"
});

assert.equal(complete.assetChange, "300.000000");
assert.equal(complete.valuationMovement, "110.000000");

const missingSnapshot = calculateMonthlyBridge({
  startValue: null,
  endValue: "1300.000000",
  netPrincipalFlow: "200.000000",
  cashAdjustmentImpact: "0.000000"
});

assert.equal(missingSnapshot.assetChange, null);
assert.equal(missingSnapshot.valuationMovement, null);

const missingFlow = calculateMonthlyBridge({
  startValue: "1000.000000",
  endValue: "1300.000000",
  netPrincipalFlow: null,
  cashAdjustmentImpact: "0.000000"
});

assert.equal(missingFlow.assetChange, "300.000000");
assert.equal(missingFlow.valuationMovement, null);

const windows = getMonthlySnapshotWindows("2026-06");

assert.deepEqual(windows.startWindow, { from: "0001-01-01", to: "2026-05-31" });
assert.deepEqual(windows.endWindow, { from: "2026-06-01", to: "2026-06-30" });

console.log("Monthly summary bridge verification passed.");
