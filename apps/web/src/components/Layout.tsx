import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";

const navigationItems = [
  { to: "/dashboard", label: "财富足迹" },
  { to: "/accounts", label: "投资账户" },
  { to: "/instruments", label: "投资标的" },
  { to: "/transactions", label: "交易记录" },
  { to: "/holdings", label: "持仓总览" },
  { to: "/market-data", label: "数据同步" },
  { to: "/settings", label: "设置" },
  { to: "/about", label: "关于" }
];

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/icon-64x64.png" alt="" aria-hidden="true" />
          <div>
            <strong>小家大财</strong>
            <span>Family Ledger</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="logout-button" type="button" onClick={handleSignOut}>
          退出登录
        </button>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
