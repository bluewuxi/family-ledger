import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface DrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  dirty?: boolean;
}

export function Drawer({ title, subtitle, open, onClose, children, footer, busy = false, dirty = false }: DrawerProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(open);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const close = useRef(() => {});
  close.current = () => {
    if (!busy && (!dirty || window.confirm("有未保存的修改，确定离开吗？"))) onClose();
  };
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setShouldRender(false), 260);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || !shouldRender) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] ?? panel.current)?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0]; const last = elements.at(-1);
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    function containFocus(event: FocusEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) (focusable()[0] ?? panel.current)?.focus();
    }
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, shouldRender]);

  if (!shouldRender) return null;
  return (
    <div className="drawer-overlay" data-state={visible ? "open" : "closed"} role="presentation" onMouseDown={() => close.current()}>
      <aside ref={panel} tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} className="drawer-panel" role="dialog" onMouseDown={event => event.stopPropagation()}>
        <header className="drawer-header"><div><h2 id={titleId}>{title}</h2>{subtitle ? <p id={subtitleId}>{subtitle}</p> : null}</div><button aria-label="关闭" disabled={busy} className="icon-button" type="button" onClick={() => close.current()}><span aria-hidden="true">×</span></button></header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
