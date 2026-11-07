import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { claimDocumentTitle } from "../i18n/instance";
import type navigation from "../i18n/resources/en/navigation";
export function routeTitleKey(path: string, search: string): keyof typeof navigation | null {
  if (path === "/accounts/new") return "accountCreate";
  if (/^\/accounts\/[^/]+$/.test(path)) return "accountDetail";
  if (/^\/holdings\/[^/]+\/[^/]+$/.test(path)) return "holdingDetail";
  if (path === "/daily-expense/import" || /^\/daily-expense\/import\/[^/]+$/.test(path)) return "import";
  if (path === "/instruments" && new URLSearchParams(search).get("tab") === "groups") return "instruments";
  const routes: Record<string, keyof typeof navigation> = {"/dashboard":"dashboard", "/accounts":"accounts", "/holdings":"holdings", "/instruments":"instruments", "/transactions":"transactions", "/daily-expense":"dailyExpense", "/cashflows":"dailyExpense", "/education":"education", "/reports/monthly-summary":"monthly", "/data-maintenance":"maintenance", "/settings":"settings", "/about":"about"};
  return routes[path] ?? null;
}
export function RouteDocumentTitle() {
  const {pathname, search} = useLocation();
  const {t} = useTranslation(["navigation", "common", "auth", "investmentGroups"]);
  useEffect(() => {
    claimDocumentTitle();
    const authKey = pathname === "/login" ? "login" : ["/forgot-password", "/reset-password"].includes(pathname) ? "forgotTitle" : pathname === "/change-password" ? "changeTitle" : null;
    const key = routeTitleKey(pathname, search);
    const page = authKey ? t(`auth:${authKey}`) : pathname === "/instruments" && new URLSearchParams(search).get("tab") === "groups" ? t("investmentGroups:groups") : key ? t(key) : null;
    const product = t("common:productName");
    document.title = page ? t("title", {page, product}) : product;
  }, [pathname, search, t]);
  return null;
}
