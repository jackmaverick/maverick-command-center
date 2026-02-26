"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { MobileNav } from "./mobile-nav";

export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center h-16 px-4 lg:px-6 bg-[#0d1117]/80 backdrop-blur-sm border-b border-[#30363d] lg:pl-64">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="lg:hidden p-2 text-[#8b949e] hover:text-[#e6edf3]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1 lg:ml-4">
          <span className="text-sm text-[#8b949e]">
            Maverick Exteriors — Sales & Ops
          </span>
        </div>
      </header>
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </>
  );
}
