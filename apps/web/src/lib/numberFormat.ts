const displayLocale = "zh-CN";

export function formatDisplayPrice(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 4);
}

export function formatDisplayAmount(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 3);
}

export function formatDisplayPercent(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 1, 1);
}

export function formatSignedDisplayAmount(value: string | number | null | undefined): string {
  return formatSignedDisplayDecimal(value, formatDisplayAmount);
}

export function formatSignedDisplayPercent(value: string | number | null | undefined): string {
  return formatSignedDisplayDecimal(value, formatDisplayPercent);
}

function formatDisplayDecimal(
  value: string | number | null | undefined,
  maximumFractionDigits: number,
  minimumFractionDigits = 0
): string {
  if (value === null || value === undefined) {
    return "--";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "--";
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return normalized;
  }

  return numericValue.toLocaleString(displayLocale, {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatSignedDisplayDecimal(
  value: string | number | null | undefined,
  formatter: (input: string | number | null | undefined) => string
): string {
  if (value === null || value === undefined) {
    return "--";
  }

  const numericValue = Number(String(value).trim());
  const formatted = formatter(value);
  const displayZero = isFormattedZero(formatted);
  const normalizedFormatted = displayZero && formatted.startsWith("-") ? formatted.slice(1) : formatted;

  return Number.isFinite(numericValue) && numericValue > 0 && !displayZero ? `+${normalizedFormatted}` : normalizedFormatted;
}

function isFormattedZero(value: string): boolean {
  const normalized = value.replace(/,/g, "");
  return normalized !== "" && Number(normalized) === 0;
}
