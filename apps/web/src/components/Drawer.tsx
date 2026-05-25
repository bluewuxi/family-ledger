import { useEffect, useState, type ReactNode } from "react";

interface DrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ title, subtitle, open, onClose, children, footer }: DrawerProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const animationFrameId = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(animationFrameId);
    }

    setVisible(false);
    if (!shouldRender) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setShouldRender(false), 220);
    return () => window.clearTimeout(timeoutId);
  }, [open, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="drawer-overlay" data-state={visible ? "open" : "closed"} role="presentation" onMouseDown={onClose}>
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
