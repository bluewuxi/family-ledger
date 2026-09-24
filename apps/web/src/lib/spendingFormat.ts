/** Format authoritative decimal strings without first rounding through a JS number. */
export function formatSpendingAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, integer, decimals = ""] = match;
  const fraction = decimals.replace(/0+$/, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}
