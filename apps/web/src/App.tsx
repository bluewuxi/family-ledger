import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/authContext";
import { AccountsPage } from "./pages/AccountsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MarketDataPage } from "./pages/MarketDataPage";
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
    </Routes>
  );
}

export function App() {
  // TODO: Add role-based UI display once Lambda API returns viewer/admin role.
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  );
}

function ProtectedApp() {
  const { session, loading } = useAuth();

  if (loading) {
    return <main className="loading-page">正在加载...</main>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}
