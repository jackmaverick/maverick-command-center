"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  Home,
  Hammer,
  Shield,
  Wrench,
  Users,
  Zap,
  BarChart3,
  Target,
  CalendarDays,
  Bot,
  MessageCircleQuestion,
  Settings,
  TrendingUp,
  Wallet,
  GitCompare,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "OVERVIEW",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: GitBranch },
    ],
  },
  {
    label: "SEGMENTS",
    items: [
      { href: "/segments/real-estate", label: "Real Estate", icon: Home },
      { href: "/segments/retail", label: "Retail", icon: Hammer },
      { href: "/segments/insurance", label: "Insurance", icon: Shield },
      { href: "/segments/repairs", label: "Repairs", icon: Wrench },
    ],
  },
  {
    label: "SALES",
    items: [
      { href: "/sales", label: "Sales Performance", icon: Users },
      { href: "/speed-to-lead", label: "Speed to Lead", icon: Zap },
      { href: "/job-types", label: "Job Types", icon: BarChart3 },
    ],
  },
  {
    label: "FINANCIAL",
    items: [
      { href: "/financial/pnl", label: "P&L", icon: TrendingUp },
      { href: "/financial/cashflow", label: "Cash Flow", icon: Wallet },
      { href: "/financial/reconciliation", label: "Reconciliation", icon: GitCompare },
      { href: "/gross-profit", label: "Gross Profit", icon: DollarSign },
    ],
  },
  {
    label: "ANALYTICS",
    items: [
      { href: "/lead-sources", label: "Lead Sources", icon: Target },
      { href: "/weekly-review", label: "Weekly Review", icon: CalendarDays },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/faq-review", label: "FAQ Review", icon: MessageCircleQuestion },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0d1117] border-r border-[#30363d]">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-[#30363d]">
        <h1 className="text-lg font-bold text-[#e6edf3]">
          MAVERICK
          <span className="block text-xs font-normal text-[#8b949e]">
            Command Center
          </span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-6">
            <h2 className="px-3 mb-2 text-[10px] font-semibold tracking-wider text-[#8b949e] uppercase">
              {group.label}
            </h2>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                        isActive
                          ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                          : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
                      )}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Status bar */}
      <div className="px-4 py-3 border-t border-[#30363d] text-xs text-[#8b949e]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          DB: Connected
        </div>
      </div>
    </aside>
  );
}
