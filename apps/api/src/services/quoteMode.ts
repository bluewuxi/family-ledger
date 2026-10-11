import { ApiRequestError } from "../utils/apiError";
export function parseQuoteMode(value?: string): "cached" | "refresh" {
  if (value === undefined || value === "refresh") return "refresh";
  if (value === "cached") return value;
  throw new ApiRequestError("VALIDATION_ERROR", "Invalid quoteMode.", 400);
}
