import { useTranslation } from "react-i18next";
import { BrandName } from "./BrandName";
import { LanguageSwitch } from "./LanguageSwitch";
import { observeAsync } from "../lib/observeAsync";
import { getCurrentSession } from "../lib/authClient";
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
import { navigationGroups, navigationItems } from "../lib/navigation";

const sidebarStorageKey = "family-ledger.sidebar.collapsed";
const mobileSidebarMediaQuery = "(max-width: 820px)";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const {t} = useTranslation(["navigation", "common", "auth"]);
  const { localAuthBypassEmail, signOut } = useAuth();
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
        window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
      }
      if (event.key === "Tab") {
        const items = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []).filter(item => item.getClientRects().length > 0);
        const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
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
    const sidebar = sidebarRef.current;
    const appMain = appMainRef.current;
    setElementInert(sidebar, isMobileViewport && !mobileSidebarOpen);
    setElementInert(appMain, isMobileViewport && mobileSidebarOpen);

    return () => {
      setElementInert(sidebar, false);
      setElementInert(appMain, false);
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
    try { if (await signOut() && !getCurrentSession()) observeAsync(navigate("/login", { replace: true })); }
    catch { if (!getCurrentSession()) observeAsync(navigate("/login?logoutUnconfirmed=1", { replace: true })); }
  }

  return (
    <div className={["app-shell", sidebarCollapsed ? "app-shell-collapsed" : "", mobileSidebarOpen ? "app-shell-mobile-open" : ""].filter(Boolean).join(" ")}>
      <button
        className="sidebar-mobile-toggle"
        type="button"
        ref={mobileToggleRef}
        aria-controls="app-sidebar"
        aria-expanded={mobileSidebarOpen}
        aria-label={t("open")}
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label={t("close")}
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
              <strong className="brand-name"><BrandName /></strong>
              <span className="brand-subtitle" aria-label="Family Ledger">
                <span>Family</span>
                <span>Ledger</span>
              </span>
            </div>
          </div>

          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? t("expand") : t("collapse")}
            title={sidebarCollapsed ? t("expand") : t("collapse")}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
          <button
            className="sidebar-mobile-close"
            type="button"
            ref={mobileCloseRef}
            aria-label={t("close")}
            onClick={() => closeMobileSidebar({ restoreFocus: true })}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="nav-list" aria-label={t("primary")}>
          {navigationGroups.map(group => <div key={group} className={`nav-group${group === "tools" ? " nav-utilities" : ""}`}><h2 className="nav-group-label">{t(group)}</h2>{navigationItems.filter(item => item.group === group).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "active" : undefined)}
                title={sidebarCollapsed ? t(item.labelKey) : undefined}
                data-tooltip={sidebarCollapsed ? t(item.labelKey) : undefined}
                onClick={() => closeMobileSidebar()}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}</div>)}
        </nav>

        <button
          className="logout-button"
          type="button"
          title={sidebarCollapsed ? t("auth:logout") : undefined}
          data-tooltip={sidebarCollapsed ? t("auth:logout") : undefined}
          onClick={() => observeAsync((handleSignOut)())}
        >
          <LogOut size={17} aria-hidden="true" />
          <span>{t("auth:logout")}</span>
        </button>
        <LanguageSwitch />
      </aside>

      <div
        className="app-main"
        ref={appMainRef}
        aria-hidden={isMobileViewport && mobileSidebarOpen ? true : undefined}
      >
        <MobileAppHeader />
        {localAuthBypassEmail ? (
          <div className="local-auth-banner">{t("debug", {email:localAuthBypassEmail})}</div>
        ) : null}
        <main className="main-content">
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
  const {t} = useTranslation("common");
  return (
    <header className="mobile-app-header" aria-label={t("productName")}>
      <img className="mobile-app-logo" src="/icon-64x64.png" alt="" aria-hidden="true" />
      <div className="brand-copy mobile-app-brand-copy">
        <strong className="brand-name"><BrandName /></strong>
        <span className="brand-subtitle" aria-label="Family Ledger">
          <span>Family</span>
          <span>Ledger</span>
        </span>
      </div>
    </header>
  );
}

function AppFooter() {
  const {t} = useTranslation("common");
  return (
    <footer className="app-footer">
      <div className="footer-brand">
        <span className="footer-brand-mark-wrap" aria-hidden="true">
          <img className="footer-brand-mark" src="/icon-64x64.png" alt="" />
        </span>
        <div className="footer-brand-copy">
          <strong className="footer-brand-name"><BrandName /></strong>
          <span className="brand-subtitle footer-brand-subtitle" aria-label="Family Ledger">
            <span>Family</span>
            <span>Ledger</span>
          </span>
        </div>
      </div>
      <p>{t("motto")}  © 2026 Ricky Yu</p>
      <Banknote className="footer-status-icon" size={18} aria-hidden="true" />
    </footer>
  );
}
