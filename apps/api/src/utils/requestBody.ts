import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ApiRequestError } from "./apiError";

export function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body is required.", 400);
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
}
