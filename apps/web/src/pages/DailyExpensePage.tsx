import { useEffect, useRef } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { SpendingPage } from "./SpendingPage";
import { EducationReservePage } from "./EducationReservePage";
import { CashflowReportPage } from "./CashflowReportPage";
import { PageTitle } from "../components/PageTitle";
import { legacyAccountDates, familyCashflowFilters, familyCashflowLocation, familyCashflowTabs, getFamilyCashflowTab, type FamilyCashflowTab } from "../lib/familyCashflowNavigation";

export function LegacyCashflowRedirect({ tab }: { tab: "education" | "report" }) {
  const [params] = useSearchParams();
  return <Navigate replace to={familyCashflowLocation(tab, params)} />;
}
export function DailyExpensePage() {
  const [params, setParams] = useSearchParams();
  const tab = getFamilyCashflowTab(params);
  const remembered = useRef<Partial<Record<FamilyCashflowTab, string>>>({});
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    remembered.current[tab] = familyCashflowFilters(tab, params).toString();
  }, [tab, params]);
  useEffect(() => {
    navigation.current?.querySelector<HTMLButtonElement>("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  function select(next: FamilyCashflowTab) {
    remembered.current[tab] = familyCashflowFilters(tab, params).toString();
    const restored = new URLSearchParams(remembered.current[next]);
    restored.set("tab", next);
    setParams(restored);
  }
  if (params.get("tab") === "accounts") {
    const dates = legacyAccountDates(params);
    return <Navigate replace to={familyCashflowLocation("spending", dates)} />;
  }
  return <>
    <header className="page-header"><PageTitle route="/daily-expense">家庭收支</PageTitle></header>
    <nav ref={navigation} className="spending-tabs" aria-label="家庭收支视图">
      {familyCashflowTabs.map(item => <button key={item.value} type="button" aria-current={tab === item.value ? "page" : undefined} onClick={() => select(item.value)}>{item.label}</button>)}
    </nav>
    {tab === "spending" && <SpendingPage />}
    {tab === "education" && <EducationReservePage />}
    {tab === "report" && <CashflowReportPage />}
  </>;
}
