import type { LucideIcon } from "lucide-react";
import {
  CircleDollarSign,
  GitBranch,
  Home,
  Megaphone,
  Settings,
  UsersRound,
  Wallet,
} from "lucide-react";

export interface NavigationTab {
  href: string;
  label: string;
}

export interface NavigationGroup {
  label: string;
  icon: LucideIcon;
  tabs: NavigationTab[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Home",
    icon: Home,
    tabs: [
      { href: "/", label: "Dashboard" },
      { href: "/weekly-review", label: "Weekly Review" },
    ],
  },
  {
    label: "Sales Funnel",
    icon: GitBranch,
    tabs: [
      { href: "/metrics", label: "Metrics" },
      { href: "/metrics/stale-estimates", label: "Stale Estimates" },
      { href: "/pipeline", label: "Pipeline" },
      { href: "/segments/real-estate", label: "Real Estate" },
      { href: "/segments/retail", label: "Retail" },
      { href: "/segments/insurance", label: "Insurance" },
      { href: "/segments/repairs", label: "Repairs" },
      { href: "/sales", label: "Sales" },
      { href: "/speed-to-lead", label: "Speed to Lead" },
      { href: "/leads", label: "Leads" },
    ],
  },
  {
    label: "Homeowners",
    icon: UsersRound,
    tabs: [
      { href: "/homeowners", label: "Search" },
      { href: "/campaign-board", label: "Campaign Board" },
    ],
  },
  {
    label: "Cash",
    icon: Wallet,
    tabs: [
      { href: "/financial/cashflow", label: "Cash Flow" },
      { href: "/financial/pipeline-cashflow", label: "Pipeline Cashflow" },
      { href: "/financial/bob-buyout", label: "Bob Buyout" },
    ],
  },
  {
    label: "Overhead & P&L",
    icon: CircleDollarSign,
    tabs: [
      { href: "/financial/pnl", label: "P&L" },
      { href: "/gross-profit", label: "Gross Profit" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    tabs: [
      { href: "/lead-sources", label: "Lead Sources" },
      { href: "/direct-mail", label: "Direct Mail" },
      { href: "/meta-ads", label: "Meta Ads" },
    ],
  },
  {
    label: "System",
    icon: Settings,
    tabs: [
      { href: "/settings", label: "Settings" },
      { href: "/loop-health", label: "Loop Health" },
      { href: "/agents", label: "Agents" },
      { href: "/financial/reconciliation", label: "Data Health · Reconciliation" },
      { href: "/revenue", label: "Data Health · Revenue Audit" },
      { href: "/due-dates", label: "Data Health · Due Dates" },
      { href: "/faq-review", label: "Data Health · FAQ Review" },
    ],
  },
];

export function isNavigationTabActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/" || !pathname.startsWith(`${href}/`)) return false;

  return !navigationGroups.some((group) =>
    group.tabs.some(
      (tab) =>
        tab.href !== href &&
        tab.href.startsWith(`${href}/`) &&
        (pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    )
  );
}
