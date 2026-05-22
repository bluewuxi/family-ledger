import type { ScheduledEvent } from "aws-lambda";

export async function handler(event: ScheduledEvent): Promise<void> {
  // TODO: Stage 4 will update US/HK/CN/NZ instrument prices.
  // This Lambda will later be triggered by EventBridge.
  console.log("updatePrices placeholder", { id: event.id, time: event.time });
}
