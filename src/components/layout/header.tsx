"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils";

export function Header({ contained = false }: { contained?: boolean }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data: session, status } = useSession();

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-[#30363d] bg-[#0d1117]/80 px-4 backdrop-blur-sm lg:px-6",
          contained ? "lg:pl-0" : "lg:pl-64"
        )}
      >
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
        <div className="flex items-center gap-3">
          <span className="hidden max-w-64 truncate text-xs text-[#8b949e] sm:block">
            {status === "loading"
              ? "Checking session…"
              : session?.user?.email ?? "Signed in"}
          </span>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="text-xs text-[#8b949e] transition-colors hover:text-[#e6edf3]"
          >
            Sign out
          </button>
        </div>
      </header>
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </>
  );
}
