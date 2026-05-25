import type { ReactNode } from "react";

interface DrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ title, subtitle, open, onClose, children, footer }: DrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        aria-modal="true"
        className="drawer-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button aria-label="关闭" className="icon-button" type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
