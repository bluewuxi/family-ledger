import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoadingState } from "./components/LoadingState";
import { AuthProvider, useAuth } from "./lib/authContext";
import { PreferencesProvider } from "./lib/preferencesContext";
import { AccountsPage } from "./pages/AccountsPage";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MarketDataPage } from "./pages/MarketDataPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/instruments" element={<InstrumentsPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/holdings" element={<HoldingsPage />} />
      <Route path="/market-data" element={<MarketDataPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/about" element={<AboutPage />} />
    </Routes>
  );
}

export function App() {
  // TODO: Add role-based UI display once Lambda API returns viewer/admin role.
  return (
    <AuthProvider>
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
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main className="loading-page">
        <LoadingState label="正在加载" />
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PreferencesProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </PreferencesProvider>
  );
}
