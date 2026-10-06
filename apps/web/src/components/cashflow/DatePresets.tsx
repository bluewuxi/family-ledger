import { cashflowDatePreset } from "../../lib/cashflowDates";
export function DatePresets({ onChange }: { onChange: (range: { from: string; to: string }) => void }) {
  return <div className="date-presets" aria-label="快捷日期">
    {([ ["month", "本月"], ["previous", "上月"], ["year", "今年"] ] as const).map(([value, label]) => <button type="button" key={value} onClick={() => onChange(cashflowDatePreset(value))}>{label}</button>)}
  </div>;
}
