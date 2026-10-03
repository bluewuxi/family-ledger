import { useSearchParams } from "react-router-dom";
import { AccountPurposePage } from "./AccountPurposePage";
import { SpendingPage } from "./SpendingPage";
import { CashflowScope } from "../components/cashflow/CashflowScope";
import { PageTitle } from "../components/PageTitle";
export function DailyExpensePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "spending" ? "spending" : "accounts";
  return (
    <>
      <header className="page-header"><PageTitle route="/daily-expense">日常收支</PageTitle><CashflowScope value="daily_expense" /></header>
      <nav className="spending-tabs" aria-label="日常收支视图">
        <button
          aria-current={tab === "accounts" ? "page" : undefined}
          onClick={() =>
            setParams((old) => {
              const q = new URLSearchParams(old);
              q.set("tab", "accounts");
              return q;
            })
          }
        >
          账户收支
        </button>
        <button
          aria-current={tab === "spending" ? "page" : undefined}
          onClick={() =>
            setParams((old) => {
              const q = new URLSearchParams(old);
              q.set("tab", "spending");
              return q;
            })
          }
        >
          交易明细
        </button>
      </nav>
      {tab === "accounts" ? (
        <AccountPurposePage purpose="daily_expense" embedded />
      ) : (
        <>
          <h2>交易明细</h2>
          <SpendingPage />
        </>
      )}
    </>
  );
}
