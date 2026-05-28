import { formatDateTimeInTimeZone, getLocalDateString } from "@family-ledger/shared";

export { getLocalDateString };

export function formatLocalDateTime(value: string | null, fallback = "-", timeZone?: string): string {
  if (!value) {
    return fallback;
  }

  return formatDateTimeInTimeZone(value, timeZone ?? getViewerTimeZone(), "zh-CN", value);
}

export function formatLocalDateTimeNote(value: string | null, fallback: string): string {
  const formatted = formatLocalDateTime(value, fallback);
  return formatted === fallback ? formatted : `${formatted}（本地时间）`;
}

function getViewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
