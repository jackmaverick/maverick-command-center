"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  isNavigationTabActive,
  navigationGroups,
} from "@/components/layout/navigation";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="left"
        className="h-dvh max-h-dvh w-72 gap-0 overflow-hidden border-[#30363d] bg-[#0d1117] p-0"
      >
        <SheetHeader className="shrink-0 border-b border-[#30363d] px-6 py-4">
          <SheetTitle className="text-[#e6edf3] text-left">
            MAVERICK
            <span className="block text-xs font-normal text-[#8b949e]">
              Command Center
            </span>
          </SheetTitle>
        </SheetHeader>
        <nav
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch]"
          aria-label="Mobile navigation"
        >
          <ul className="space-y-4">
            {navigationGroups.map((group) => (
              <li key={group.label}>
                <div className="flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#e6edf3]">
                  <group.icon className="h-3.5 w-3.5 text-[#8b949e]" />
                  {group.label}
                </div>
                <ul className="mt-1 space-y-0.5 border-l border-[#30363d] pl-3 ml-4">
                  {group.tabs.map((tab) => {
                    const isActive = isNavigationTabActive(pathname, tab.href);
                    return (
                      <li key={tab.href}>
                        <Link
                          href={tab.href}
                          onClick={onClose}
                          className={cn(
                            "block rounded-md px-3 py-1.5 text-sm transition-colors",
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
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
