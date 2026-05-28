import type { ReactNode } from "react";
import { getNavigationItem } from "../lib/navigation";

interface PageTitleProps {
  route: string;
  children: ReactNode;
}

export function PageTitle({ route, children }: PageTitleProps) {
  const navigationItem = getNavigationItem(route);
  const Icon = navigationItem?.icon;

  return (
    <h1 className="page-title">
      {Icon ? <Icon size={26} aria-hidden="true" /> : null}
      <span>{children}</span>
    </h1>
  );
}
