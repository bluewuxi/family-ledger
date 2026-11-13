import { investmentFieldDetails, parseApiErrorDetails, type ApiError, type ApiErrorDetails } from "@family-ledger/shared";
export { investmentFieldDetails };

export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  public readonly details?: ApiErrorDetails;
  constructor(
    public readonly code: ApiError["code"],
    message: string,
    public readonly statusCode: number,
    details?: ApiErrorDetails
  ) {
    super(message);
    this.details = parseApiErrorDetails(details);
  }
}
