import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { familyCashflowFilters, type FamilyCashflowTab } from "./familyCashflowNavigation";

export function useCashflowQuery(tab: FamilyCashflowTab) {
  const [params, setParams] = useSearchParams();
  const applied = familyCashflowFilters(tab, params).toString();
  const [draft, setDraft] = useState(() => new URLSearchParams(applied));
  useEffect(() => { setDraft(new URLSearchParams(applied)); }, [applied]);
  function change(values: Record<string, string>) {
    setDraft(old => { const next = new URLSearchParams(old); for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); } return next; });
  }
  function apply(reset = false) {
    const next = reset ? new URLSearchParams(tab === "report" ? { domain: params.get("domain") ?? "all" } : {}) : familyCashflowFilters(tab, draft);
    next.delete("offset"); next.set("tab", tab);
    setDraft(familyCashflowFilters(tab, next)); setParams(next);
  }
  return { draft, change, apply };
}
