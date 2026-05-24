import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ApiError, ApiResponse } from "@family-ledger/shared";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

const allowedOrigin = process.env.ALLOWED_ORIGIN;

export function success<T>(data: T, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  const body: ApiResponse<T> = { success: true, data };

  return {
    statusCode,
    headers: responseHeaders(),
    body: JSON.stringify(body)
  };
}

export function failure(error: ApiError, statusCode: number): APIGatewayProxyStructuredResultV2 {
  const body: ApiResponse<never> = { success: false, error };

  return {
    statusCode,
    headers: responseHeaders(),
    body: JSON.stringify(body)
  };
}

export function preflight(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: responseHeaders(),
    body: ""
  };
}

function responseHeaders(): Record<string, string> {
  return {
    ...jsonHeaders,
    ...(allowedOrigin
      ? {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "authorization,content-type,accept",
          "access-control-max-age": "86400"
        }
      : {})
  };
}
