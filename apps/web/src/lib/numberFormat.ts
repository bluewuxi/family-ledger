const displayLocale = "zh-CN";

export function formatDisplayPrice(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 4);
}

export function formatDisplayAmount(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 3);
}

export function formatDisplayPercent(value: string | number | null | undefined): string {
  return formatDisplayDecimal(value, 3);
}

function formatDisplayDecimal(value: string | number | null | undefined, maximumFractionDigits: number): string {
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
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}
