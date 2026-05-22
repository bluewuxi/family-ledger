import type { ScheduledEvent } from "aws-lambda";

export async function handler(event: ScheduledEvent): Promise<void> {
  // TODO: Stage 4 will update FX rates to NZD.
  // This Lambda will later be triggered by EventBridge.
  console.log("updateFxRates placeholder", { id: event.id, time: event.time });
}
