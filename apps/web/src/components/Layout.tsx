import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Banknote,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { navigationItems } from "../lib/navigation";

const sidebarStorageKey = "family-ledger.sidebar.collapsed";
const mobileSidebarMediaQuery = "(max-width: 820px)";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const appMainRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarStorageKey) === "true");
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia(mobileSidebarMediaQuery).matches);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileSidebarMediaQuery);

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMobileViewport(event.matches);
      if (!event.matches) {
        setMobileSidebarOpen(false);
      }
    }

    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return undefined;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    }

    if (isMobileViewport) {
      document.addEventListener("keydown", closeOnEscape);
      document.body.classList.add("mobile-sidebar-open");
      window.requestAnimationFrame(() => mobileCloseRef.current?.focus());
    }

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("mobile-sidebar-open");
    };
  }, [isMobileViewport, mobileSidebarOpen]);

  useEffect(() => {
    setElementInert(sidebarRef.current, isMobileViewport && !mobileSidebarOpen);
    setElementInert(appMainRef.current, isMobileViewport && mobileSidebarOpen);

    return () => {
      setElementInert(sidebarRef.current, false);
      setElementInert(appMainRef.current, false);
    };
  }, [isMobileViewport, mobileSidebarOpen]);

  function closeMobileSidebar({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    setMobileSidebarOpen(false);
    if (restoreFocus && isMobileViewport) {
      window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
    }
  }

  async function handleSignOut() {
    closeMobileSidebar();
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={["app-shell", sidebarCollapsed ? "app-shell-collapsed" : "", mobileSidebarOpen ? "app-shell-mobile-open" : ""].filter(Boolean).join(" ")}>
      <button
        className="sidebar-mobile-toggle"
        type="button"
        ref={mobileToggleRef}
        aria-controls="app-sidebar"
        aria-expanded={mobileSidebarOpen}
        aria-label="打开导航"
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="关闭导航"
        onClick={() => closeMobileSidebar({ restoreFocus: true })}
      />
      <aside
        className="sidebar"
        id="app-sidebar"
        ref={sidebarRef}
        aria-hidden={isMobileViewport && !mobileSidebarOpen ? true : undefined}
      >
        <div className="sidebar-top">
          <div className={`brand${sidebarCollapsed ? " brand-collapsed" : ""}`}>
            <img className="brand-mark" src="/icon-64x64.png" alt="" aria-hidden="true" />
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
          <button
            className="sidebar-mobile-close"
            type="button"
            ref={mobileCloseRef}
            aria-label="关闭导航"
            onClick={() => closeMobileSidebar({ restoreFocus: true })}
          >
            <X size={18} aria-hidden="true" />
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
                onClick={() => closeMobileSidebar()}
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

      <div
        className="app-main"
        ref={appMainRef}
        aria-hidden={isMobileViewport && mobileSidebarOpen ? true : undefined}
      >
        <MobileAppHeader />
        <main className="main-content">
          {sidebarCollapsed ? <CollapsedContentBrand /> : null}
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

function setElementInert(element: HTMLElement | null, inert: boolean): void {
  if (!element) {
    return;
  }

  if (inert) {
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("inert");
  }
}

function MobileAppHeader() {
  return (
    <header className="mobile-app-header" aria-label="小家大财 Family Ledger">
      <img className="mobile-app-logo" src="/icon-64x64.png" alt="" aria-hidden="true" />
      <div className="brand-copy mobile-app-brand-copy">
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
    </header>
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
      <Banknote className="footer-status-icon" size={18} aria-hidden="true" />
    </footer>
  );
}
