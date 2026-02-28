"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/segments/real-estate", label: "Real Estate" },
  { href: "/segments/retail", label: "Retail" },
  { href: "/segments/insurance", label: "Insurance" },
  { href: "/segments/repairs", label: "Repairs" },
  { href: "/sales", label: "Sales Performance" },
  { href: "/speed-to-lead", label: "Speed to Lead" },
  { href: "/job-types", label: "Job Types" },
  { href: "/lead-sources", label: "Lead Sources" },
  { href: "/weekly-review", label: "Weekly Review" },
  { href: "/agents", label: "Agents" },
  { href: "/faq-review", label: "FAQ Review" },
  { href: "/settings", label: "Settings" },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-72 bg-[#0d1117] border-[#30363d] p-0">
        <SheetHeader className="px-6 py-4 border-b border-[#30363d]">
          <SheetTitle className="text-[#e6edf3] text-left">
            MAVERICK
            <span className="block text-xs font-normal text-[#8b949e]">
              Command Center
            </span>
          </SheetTitle>
        </SheetHeader>
        <nav className="py-4 px-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "block px-3 py-2 text-sm rounded-md transition-colors",
                      isActive
                        ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                        : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
