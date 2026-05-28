import { useEffect, useState, type ReactNode } from "react";
import {
  Banknote,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { navigationItems } from "../lib/navigation";

const sidebarStorageKey = "family-ledger.sidebar.collapsed";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarStorageKey) === "true");

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell-collapsed" : ""}`}>
      <button
        className="sidebar-mobile-toggle"
        type="button"
        aria-label={sidebarCollapsed ? "展开导航" : "收起导航"}
        onClick={() => setSidebarCollapsed((current) => !current)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className={`brand${sidebarCollapsed ? " brand-collapsed" : ""}`}>
            <img className="brand-mark" src="/icon-64x64.png" alt="" aria-hidden="true" />
            {!sidebarCollapsed ? (
              <div className="brand-copy">
                <strong className="brand-name" aria-label="小家大财">
                  <span>小</span>
                  <span>家</span>
                  <span className="brand-name-emphasis">大</span>
                  <span className="brand-name-gold">财</span>
                </strong>
                <span className="brand-subtitle" aria-label="Family Ledger">
                  <span>Family</span>
                  <span>Ledger</span>
                </span>
              </div>
            ) : null}
          </div>

          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "展开导航" : "收起导航"}
            title={sidebarCollapsed ? "展开导航" : "收起导航"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "active" : undefined)}
                title={sidebarCollapsed ? item.label : undefined}
                data-tooltip={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          className="logout-button"
          type="button"
          title={sidebarCollapsed ? "退出登录" : undefined}
          data-tooltip={sidebarCollapsed ? "退出登录" : undefined}
          onClick={handleSignOut}
        >
          <LogOut size={17} aria-hidden="true" />
          <span>退出登录</span>
        </button>
      </aside>

      <div className="app-main">
        <main className="main-content">
          {sidebarCollapsed ? <CollapsedContentBrand /> : null}
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

function CollapsedContentBrand() {
  return (
    <div className="collapsed-content-brand" aria-label="小家大财 Family Ledger">
      <strong>
        小家<span>大</span><em>财</em>
      </strong>
      <small>
        <span>Family</span>
        <span>Ledger</span>
      </small>
    </div>
  );
}

function AppFooter() {
  const [now, setNow] = useState(() => new Date());
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "系统时区";

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  const timeLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).format(now);

  return (
    <footer className="app-footer">
      <div className="footer-brand">
        <span className="footer-brand-mark-wrap" aria-hidden="true">
          <img className="footer-brand-mark" src="/icon-64x64.png" alt="" />
        </span>
        <div className="footer-brand-copy">
          <strong className="footer-brand-name" aria-label="小家大财">
            <span>小</span>
            <span>家</span>
            <span className="footer-brand-emphasis">大</span>
            <span className="footer-brand-gold">财</span>
          </strong>
          <span className="brand-subtitle footer-brand-subtitle" aria-label="Family Ledger">
            <span>Family</span>
            <span>Ledger</span>
          </span>
        </div>
      </div>
      <p>家庭投资记录，仅作辅助参考。所有者 / 作者：Ricky Yu</p>
      <time dateTime={now.toISOString()}>
        {timeLabel} · {timeZone}
      </time>
      <Banknote className="footer-status-icon" size={18} aria-hidden="true" />
    </footer>
  );
}
