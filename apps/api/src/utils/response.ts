import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ApiError, ApiResponse } from "@family-ledger/shared";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export function success<T>(data: T, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  const body: ApiResponse<T> = { success: true, data };

  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

export function failure(error: ApiError, statusCode: number): APIGatewayProxyStructuredResultV2 {
  const body: ApiResponse<never> = { success: false, error };

  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}
