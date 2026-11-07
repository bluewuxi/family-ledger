import { RouteDocumentTitle } from "./components/RouteDocumentTitle";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "./i18n/LanguageProvider";
import { translateUiError } from "./i18n/uiErrors";
import { AccountCreatePage } from "./pages/AccountCreatePage";
import { SpendingImportPage } from "./pages/SpendingImportPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoadingState } from "./components/LoadingState";
import { AuthProvider, useAuth } from "./lib/authContext";
import { PreferencesProvider } from "./lib/preferencesContext";
import { AccountsPage } from "./pages/AccountsPage";
import { AccountDetailPage } from "./pages/AccountDetailPage";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HoldingDetailPage } from "./pages/HoldingDetailPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { LoginPage } from "./pages/LoginPage";
import { DataMaintenancePage } from "./pages/DataMaintenancePage";
import { MonthlySummaryPage } from "./pages/MonthlySummaryPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { DailyExpensePage, LegacyCashflowRedirect } from "./pages/DailyExpensePage";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/new" element={<AccountCreatePage />} />
      <Route path="/accounts/:accountId" element={<AccountDetailPage />} />
      <Route path="/instruments" element={<InstrumentsPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/daily-expense/import" element={<SpendingImportPage />} />
      <Route path="/daily-expense/import/:statementId" element={<SpendingImportPage />} />
      <Route path="/daily-expense" element={<DailyExpensePage />} />
      <Route path="/education" element={<LegacyCashflowRedirect tab="education" />} />
      <Route path="/cashflows" element={<LegacyCashflowRedirect tab="report" />} />
      <Route path="/holdings" element={<HoldingsPage />} />
      <Route path="/holdings/:accountId/:instrumentId" element={<HoldingDetailPage />} />
      <Route path="/reports/monthly-summary" element={<MonthlySummaryPage />} />
      <Route path="/data-maintenance" element={<DataMaintenancePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/about" element={<AboutPage />} />
    </Routes>
  );
}

export function App() {

  return (
    <AuthProvider><RouteDocumentTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  );
}

function ProtectedApp() {
  const {t} = useTranslation("common"); const {language} = useUiLanguage();
  const [scopeEpoch, setScopeEpoch] = useState(0);
  useEffect(() => {
    const changed = () => setScopeEpoch(value => value + 1);
    window.addEventListener("family-ledger:account-scope", changed);
    return () => window.removeEventListener("family-ledger:account-scope", changed);
  }, []);
  const location = useLocation();
  const { session, loading, error, retry } = useAuth();

  if (loading) {
    return (
      <main className="loading-page">
        <LoadingState />
      </main>
    );
  }

  if (error) return <main className="login-page"><section className="login-panel"><p role="alert">{translateUiError(error, language)}</p><button type="button" className="secondary-button" onClick={retry}>{t("retry")}</button></section></main>;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.mustChangePassword || location.pathname === "/change-password") return <ChangePasswordPage />;

  return (
    <PreferencesProvider key={`${session.user.id}:${scopeEpoch}`}>
      <Layout>
        <AppRoutes />
      </Layout>
    </PreferencesProvider>
  );
}
