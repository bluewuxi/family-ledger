import { useTranslation } from "react-i18next";
import { cashflowDatePreset } from "../../lib/cashflowDates";
export function DatePresets({ onChange, labels }: { labels?: { aria: string; month: string; previous: string; year: string }; onChange: (range: { from: string; to: string }) => void }) {
  const { t: translate } = useTranslation("cashflow");
  return <div className="date-presets" aria-label={labels?.aria ?? translate("datePresets")}>
    {([ ["month", labels?.month ?? translate("thisMonth")], ["previous", labels?.previous ?? translate("previousMonth")], ["year", labels?.year ?? translate("thisYear")] ] as const).map(([value, label]) => <button type="button" key={value} onClick={() => onChange(cashflowDatePreset(value))}>{label}</button>)}
  </div>;
}
