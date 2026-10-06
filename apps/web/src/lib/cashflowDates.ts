import { getAppBusinessDate } from "@family-ledger/shared";

export function monthDateRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${days}` };
}
export function cashflowDatePreset(preset: "month" | "previous" | "year", today = getAppBusinessDate()) {
  if (preset === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return monthDateRange(date.toISOString().slice(0, 7))!;
}
