import type { ScheduledEvent } from "aws-lambda";

export async function handler(event: ScheduledEvent): Promise<void> {
  // TODO: Stage 4 will calculate daily portfolio values.
  // This Lambda will later be triggered by EventBridge.
  console.log("generatePortfolioSnapshots placeholder", { id: event.id, time: event.time });
}
