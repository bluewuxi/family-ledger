import {
  AreaChart,
  BarChart3,
  CalendarRange,
  DatabaseZap,
  FileText,
  Info,
  Landmark,
  Settings,
  Tags,
  type LucideIcon
} from "lucide-react";

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { to: "/dashboard", label: "财富足迹", icon: AreaChart },
  { to: "/accounts", label: "投资账户", icon: Landmark },
  { to: "/instruments", label: "投资标的", icon: Tags },
  { to: "/transactions", label: "交易记录", icon: FileText },
  { to: "/holdings", label: "持仓总览", icon: BarChart3 },
  { to: "/reports/monthly-summary", label: "月度回顾", icon: CalendarRange },
  { to: "/data-maintenance", label: "数据维护", icon: DatabaseZap },
  { to: "/settings", label: "设置", icon: Settings },
  { to: "/about", label: "关于", icon: Info }
];

export function getNavigationItem(path: string): NavigationItem | undefined {
  return navigationItems.find((item) => item.to === path);
}
