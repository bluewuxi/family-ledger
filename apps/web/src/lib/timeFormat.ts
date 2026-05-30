import {
  formatDateTimeInTimeZone,
  getAppBusinessDate,
  getAppBusinessDayEndInstant,
  getLocalDateString
} from "@family-ledger/shared";

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

export function formatAppBusinessDayCountdown(now: Date = new Date()): string {
  const businessDate = getAppBusinessDate(now);
  const endInstant = new Date(getAppBusinessDayEndInstant(now));
  const remainingMinutes = Math.max(0, Math.ceil((endInstant.getTime() - now.getTime()) / 60_000));

  return `交易日 ${businessDate} 将于 ${formatHoursMinutes(remainingMinutes)} 结束`;
}

export function formatHoursMinutes(totalMinutes: number): string {
  const normalizedMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}小时 ${String(minutes).padStart(2, "0")}分`;
}

function getViewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
