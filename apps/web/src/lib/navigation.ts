import type navigation from "../i18n/resources/en/navigation";
import {
  AreaChart,
  BarChart3,
  CalendarRange,
  DatabaseZap,
  FileText,
  Info,
  Landmark,
  WalletCards,
  Settings,
  Tags,
  type LucideIcon
} from "lucide-react";

export interface NavigationItem {
  to: string;
  labelKey: keyof typeof navigation;
  icon: LucideIcon;
  group: "overview" | "investment" | "family" | "tools" | "about";
}

export const navigationGroups = ["overview", "investment", "family", "tools"] as const;
export const navigationItems: NavigationItem[] = [
  { to: "/dashboard", labelKey: "dashboard", icon: AreaChart, group: "overview" },
  { to: "/reports/monthly-summary", labelKey: "monthly", icon: CalendarRange, group: "overview" },
  { to: "/holdings", labelKey: "holdings", icon: BarChart3, group: "investment" },
  { to: "/transactions", labelKey: "transactions", icon: FileText, group: "investment" },
  { to: "/instruments", labelKey: "instruments", icon: Tags, group: "investment" },
  { to: "/daily-expense", labelKey: "dailyExpense", icon: WalletCards, group: "family" },
  { to: "/accounts", labelKey: "accounts", icon: Landmark, group: "family" },
  { to: "/data-maintenance", labelKey: "maintenance", icon: DatabaseZap, group: "tools" },
  { to: "/settings", labelKey: "settings", icon: Settings, group: "tools" },
  { to: "/about", labelKey: "about", icon: Info, group: "about" }
];

export function getNavigationItem(path: string): NavigationItem | undefined {
  return navigationItems.find((item) => item.to === path);
}
