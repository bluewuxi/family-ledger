import { cashflowDatePreset } from "../../lib/cashflowDates";
export function DatePresets({ onChange, labels }: { labels?: { aria: string; month: string; previous: string; year: string }; onChange: (range: { from: string; to: string }) => void }) {
  return <div className="date-presets" aria-label={labels?.aria ?? "快捷日期"}>
    {([ ["month", labels?.month ?? "本月"], ["previous", labels?.previous ?? "上月"], ["year", labels?.year ?? "今年"] ] as const).map(([value, label]) => <button type="button" key={value} onClick={() => onChange(cashflowDatePreset(value))}>{label}</button>)}
  </div>;
}
