import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const navigationItems = [
  { to: "/dashboard", label: "仪表盘" },
  { to: "/accounts", label: "投资账户" },
  { to: "/instruments", label: "投资标的" },
  { to: "/transactions", label: "交易记录" },
  { to: "/holdings", label: "持仓总览" },
  { to: "/settings", label: "设置" }
];

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">账</span>
          <div>
            <strong>家庭投资账务</strong>
            <span>family-ledger</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
