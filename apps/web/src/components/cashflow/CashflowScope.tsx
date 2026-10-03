import { useNavigate } from "react-router-dom";
export function CashflowScope({ value, onChange }: { value: "daily_expense" | "education" | "all"; onChange?: (value: string) => void }) {
  const navigate = useNavigate();
  return <label className="cashflow-scope">资金用途<select value={value} onChange={event => {
    if (onChange) { onChange(event.target.value); return; }
    navigate(event.target.value === "education" ? "/education" : event.target.value === "daily_expense" ? "/daily-expense?tab=spending" : "/cashflows?domain=all");
  }}><option value="daily_expense">日常收支</option><option value="education">教育储备</option><option value="all">全部收支</option></select></label>;
}
