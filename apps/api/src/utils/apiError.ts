import { investmentFieldDetails, parseInvestmentErrorDetails, type ApiError, type InvestmentErrorDetails } from "@family-ledger/shared";
export { investmentFieldDetails };

export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  public readonly details?: InvestmentErrorDetails;
  constructor(
    public readonly code: ApiError["code"],
    message: string,
    public readonly statusCode: number,
    details?: InvestmentErrorDetails
  ) {
    super(message);
    this.details = parseInvestmentErrorDetails(details);
  }
}
