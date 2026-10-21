"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isNavigationTabActive,
  navigationGroups,
} from "@/components/layout/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const activeGroup = navigationGroups.find((group) =>
    group.tabs.some((tab) => isNavigationTabActive(pathname, tab.href))
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

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
        <ul className="space-y-1">
          {navigationGroups.map((group) => {
            const isActiveGroup = activeGroup?.label === group.label;
            const isExpanded =
              expandedGroup === group.label ||
              (isActiveGroup &&
                expandedGroup !== `collapsed:${group.label}`);

            return (
              <li key={group.label}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedGroup(
                      isExpanded ? `collapsed:${group.label}` : group.label
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    isActiveGroup
                      ? "bg-[#21262d] text-[#e6edf3]"
                      : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>
                {isExpanded && (
                  <ul className="mt-1 space-y-0.5 border-l border-[#30363d] py-1 pl-3 ml-5">
                    {group.tabs.map((tab) => {
                      const isActive = isNavigationTabActive(pathname, tab.href);
                      return (
                        <li key={tab.href}>
                          <Link
                            href={tab.href}
                            className={cn(
                              "block rounded-md px-3 py-1.5 text-xs transition-colors",
                              isActive
                                ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                                : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
                            )}
                          >
                            {tab.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
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
