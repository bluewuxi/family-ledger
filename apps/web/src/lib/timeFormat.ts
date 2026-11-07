import {
  formatDateTimeInTimeZone,
  getAppBusinessDate,
  getAppBusinessDayEndInstant,
  getLocalDateString
} from "@family-ledger/shared";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { i18n } from "../i18n/instance";

export { getLocalDateString };

export function formatLocalDateTime(value: string | null, fallback = "-", timeZone?: string, language: UiLanguage = "zh-CN"): string {
  if (!value) {
    return fallback;
  }

  return formatDateTimeInTimeZone(value, timeZone ?? getViewerTimeZone(), getDisplayLocale(language), value);
}

export function formatLocalDateTimeNote(value: string | null, fallback: string, language: UiLanguage = "zh-CN"): string {
  const formatted = formatLocalDateTime(value, fallback, undefined, language);
  return formatted === fallback ? formatted : i18n.getFixedT(language, "format")("localTimeNote", {value: formatted});
}

export function formatAppBusinessDayCountdown(now: Date = new Date(), language: UiLanguage = "zh-CN"): string {
  const businessDate = getAppBusinessDate(now);
  const endInstant = new Date(getAppBusinessDayEndInstant(now));
  const remainingMinutes = Math.max(0, Math.ceil((endInstant.getTime() - now.getTime()) / 60_000));

  return i18n.getFixedT(language, "format")("businessDayCountdown", {date: businessDate, duration: formatHoursMinutes(remainingMinutes, language)});
}

export function formatHoursMinutes(totalMinutes: number, language: UiLanguage = "zh-CN"): string {
  const normalizedMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return i18n.getFixedT(language, "format")("hoursMinutes", {hours: String(hours).padStart(2, "0"), minutes: String(minutes).padStart(2, "0")});
}

export function formatCalendarDate(value: string | null, fallback = "-", language: UiLanguage = "zh-CN"): string {
  if (value === null) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return value;
  if (language === "zh-CN") return value;
  const parts = new Intl.DateTimeFormat("en-NZ", {day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part("day")} ${part("month")} ${year}`;
}

function getViewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
