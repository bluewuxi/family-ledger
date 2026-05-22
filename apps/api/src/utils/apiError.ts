import type { ApiError } from "@family-ledger/shared";

export class ApiRequestError extends Error {
  constructor(
    public readonly code: ApiError["code"],
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}
