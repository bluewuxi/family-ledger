import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountsPage } from "./pages/AccountsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { LoginPage } from "./pages/LoginPage";
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
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

export function App() {
  // TODO: Read current session and route unauthenticated users to 登录.
  // TODO: Add role-based UI display once Lambda API returns viewer/admin role.
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <Layout>
            <AppRoutes />
          </Layout>
        }
      />
    </Routes>
  );
}
