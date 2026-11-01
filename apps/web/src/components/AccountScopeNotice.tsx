import { useEffect, useState } from "react";
import type { AccountAccessPolicy } from "@family-ledger/shared";
import { apiGet } from "../lib/apiClient";
export function AccountScopeNotice() {
  const [policy, setPolicy] = useState<AccountAccessPolicy>();
  useEffect(() => { let active = true; void apiGet<{ accountAccess: AccountAccessPolicy }>("/me").then(data => { if (active) setPolicy(data.accountAccess); }).catch(() => {}); return () => { active = false; }; }, []);
  return <p className="spending-hint">可见账户合计{policy?.scope.mode === "selected" && policy.scope.resources.length === 0 ? " · 暂无可访问账户" : ""}</p>;
}
