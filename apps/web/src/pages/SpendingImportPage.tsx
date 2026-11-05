import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AuthenticatedUser, SpendingAccount } from "@family-ledger/shared";
import { spendingClient } from "../lib/spendingClient";
import { observeAsync } from "../lib/observeAsync";
import { PageBackLink } from "../components/PageBackLink";
import { PageTitle } from "../components/PageTitle";
import { LoadingState } from "../components/LoadingState";
import { SpendingImportWorkspace } from "../components/spending/SpendingImportWorkspace";

export function SpendingImportPage() {
  const [data, setData] = useState<{ user: AuthenticatedUser; accounts: SpendingAccount[] }>();
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const back = "/daily-expense?" + params.toString();
  useEffect(() => { let active = true; spendingClient.accounts().then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "账户加载失败。"); }); return () => { active = false; }; }, []);
  return <section><PageBackLink to={back} label="家庭收支" /><header className="page-header"><div><PageTitle route="/daily-expense">账单导入</PageTitle><p>上传文件、核对交易并查看导入记录与附件。</p></div></header>{error ? <p role="alert" className="form-error">{error}</p> : data ? <SpendingImportWorkspace accounts={data.accounts} admin={data.user.role === "admin"} onSaved={() => {}} onViewRows={id => { const query = new URLSearchParams(params); query.set("tab", "spending"); query.set("statementId", id); observeAsync(navigate("/daily-expense?" + query.toString())); }} /> : <LoadingState label="正在加载账户" />}</section>;
}
