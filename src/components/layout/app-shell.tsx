"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicAuthPage =
    pathname === "/login" || pathname === "/configuration-error";

  if (isPublicAuthPage) {
    return <main>{children}</main>;
  }

  if (pathname === "/campaign-board") {
    return (
      <div className="h-dvh min-h-0 overflow-hidden bg-[#0d1117]">
        <Sidebar />
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden lg:pl-64">
          <Header contained />
          <main className="flex min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0 w-full overflow-hidden px-3 py-3">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <Header />
      <main className="pt-0 lg:pl-64">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </>
  );
}
