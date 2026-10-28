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
