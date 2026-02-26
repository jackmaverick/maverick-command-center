import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maverick Command Center",
  description: "Sales & Ops Dashboard for Maverick Exteriors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0d1117] text-[#e6edf3]`}
      >
        <Providers>
          <Sidebar />
          <Header />
          <main className="lg:pl-64 pt-0">
            <div className="p-4 lg:p-6">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
