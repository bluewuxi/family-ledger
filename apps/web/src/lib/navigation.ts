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
  label: string;
  icon: LucideIcon;
  group: "概览" | "投资" | "家庭" | "工具" | "about";
}

export const navigationGroups = ["概览", "投资", "家庭", "工具"] as const;
export const navigationItems: NavigationItem[] = [
  { to: "/dashboard", label: "财富足迹", icon: AreaChart, group: "概览" },
  { to: "/reports/monthly-summary", label: "月度回顾", icon: CalendarRange, group: "概览" },
  { to: "/holdings", label: "持仓总览", icon: BarChart3, group: "投资" },
  { to: "/transactions", label: "交易记录", icon: FileText, group: "投资" },
  { to: "/instruments", label: "投资标的", icon: Tags, group: "投资" },
  { to: "/daily-expense", label: "家庭收支", icon: WalletCards, group: "家庭" },
  { to: "/accounts", label: "账户管理", icon: Landmark, group: "家庭" },
  { to: "/data-maintenance", label: "数据维护", icon: DatabaseZap, group: "工具" },
  { to: "/settings", label: "设置", icon: Settings, group: "工具" },
  { to: "/about", label: "关于", icon: Info, group: "about" }
];

export function getNavigationItem(path: string): NavigationItem | undefined {
  return navigationItems.find((item) => item.to === path);
}
