import { ApiRequestError } from "../utils/apiError";
export function parseQuoteMode(value?: string): "cached" | "auto" | "refresh" {
  if (value === undefined || value === "auto") return "auto";
  if (value === "refresh") return "refresh";
  if (value === "cached") return value;
  throw new ApiRequestError("VALIDATION_ERROR", "Invalid quoteMode.", 400);
}
