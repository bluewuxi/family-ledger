import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AuthenticatedUser, SpendingAccount } from "@family-ledger/shared";
import { spendingClient } from "../lib/spendingClient";
import { observeAsync } from "../lib/observeAsync";
import { PageBackLink } from "../components/PageBackLink";
import { PageTitle } from "../components/PageTitle";
import { LoadingState } from "../components/LoadingState";
import { SpendingImportWorkspace } from "../components/spending/SpendingImportWorkspace";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeStatementError, translateStatementError, type StatementError } from "../i18n/statementMessages";

export function SpendingImportPage() {
  const { t } = useTranslation("spendingImport");
  const { t: tNavigation } = useTranslation("navigation");
  const { language } = useUiLanguage();
  const [data, setData] = useState<{ user: AuthenticatedUser; accounts: SpendingAccount[] }>();
  const [error, setError] = useState<StatementError | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const back = "/daily-expense?" + params.toString();
  useEffect(() => {
    let active = true;
    void spendingClient.accounts()
      .then(result => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(describeStatementError(reason, "read")); });
    return () => { active = false; };
  }, []);
  function viewRows(id: string) {
    const query = new URLSearchParams(params);
    query.set("tab", "spending");
    query.set("statementId", id);
    observeAsync(navigate("/daily-expense?" + query.toString()));
  }
  return (
    <section>
      <PageBackLink to={back} label={tNavigation("dailyExpense")} />
      <header className="page-header">
        <div>
          <PageTitle route="/daily-expense">{t("pageTitle")}</PageTitle>
          <p>{t("pageHelp")}</p>
        </div>
      </header>
      {error ? <p role="alert" className="form-error">{translateStatementError(error, language)}</p>
        : data ? <SpendingImportWorkspace accounts={data.accounts} admin={data.user.role === "admin"} onSaved={() => {}} onViewRows={viewRows} />
        : <LoadingState label={t("loadingAccounts")} />}
    </section>
  );
}
