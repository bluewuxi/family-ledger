import { useSearchParams } from "react-router-dom";
import { AccountPurposePage } from "./AccountPurposePage";
import { SpendingPage } from "./SpendingPage";
export function DailyExpensePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "spending" ? "spending" : "accounts";
  return (
    <>
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
          消费明细
        </button>
      </nav>
      {tab === "accounts" ? (
        <AccountPurposePage purpose="daily_expense" />
      ) : (
        <>
          <h1>消费明细</h1>
          <SpendingPage />
        </>
      )}
    </>
  );
}
