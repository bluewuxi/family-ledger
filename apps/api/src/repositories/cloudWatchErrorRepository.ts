import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { logError } from "../utils/errorLogging";

const client = new CloudWatchLogsClient({ maxAttempts: 1, requestHandler: { connectionTimeout: 2000, requestTimeout: 8000 } });
export const cloudWatchErrorTransport = { send: (command: FilterLogEventsCommand) => client.send(command) };
export interface CloudWatchErrorEvent { eventId?: string; logStreamName?: string; timestamp?: number; message?: string; }
export function apiLogGroup(): string {
  const group = process.env.API_ERROR_LOG_GROUP;
  if (!group) throw new Error("API_ERROR_LOG_GROUP is not configured.");
  return group;
}
export async function queryCloudWatchErrors(input: { from: number; to: number; nextToken?: string }) {
  return cloudWatchErrorTransport.send(new FilterLogEventsCommand({ logGroupName: apiLogGroup(), startTime: input.from,
    endTime: input.to, nextToken: input.nextToken, filterPattern: '"ERROR"', limit: 100 }));
}
export async function readCloudWatchErrorEvent(input: { stream: string; timestamp: number; eventId: string }): Promise<string | null> {
  let nextToken: string | undefined;
  // An exact millisecond and stream normally fit in one page. Stop only at the service's end.
  do {
    const result = await cloudWatchErrorTransport.send(new FilterLogEventsCommand({ logGroupName: apiLogGroup(),
      logStreamNames: [input.stream], startTime: input.timestamp, endTime: input.timestamp + 1, nextToken, limit: 100 })).catch((error: unknown) => {
        if (error instanceof Error && error.name === "ResourceNotFoundException") {
          logError("cloudWatchErrorRepository.read.deleted", error, "WARN");
          return { events: [], nextToken: undefined };
        }
        throw error;
      });
    const event = result.events?.find(row => row.eventId === input.eventId);
    if (event) return event.message ?? null;
    if (result.nextToken === nextToken) return null;
    nextToken = result.nextToken;
  } while (nextToken);
  return null;
}
