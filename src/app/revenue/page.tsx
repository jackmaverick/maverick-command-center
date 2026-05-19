"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/layout/period-selector";
import { formatCurrency } from "@/lib/dates";

type TabKey = "all" | "status" | "type" | "rep" | "qbo";

interface RevenueBreakdownRow {
  key: string;
  total: number;
  count: number;
}

interface RevenueInvoice {
  invoiceId: string;
  invoiceNumber: string | null;
  total: number;
  totalPaid: number;
  balance: number;
  invoiceStatus: string;
  invoiceDate: string | null;
  invoiceCreatedAt: string | null;
  effectiveInvoiceDate: string | null;
  jobJnid: string;
  jobName: string | null;
  jobStatus: string | null;
  recordTypeName: string;
  salesRepName: string;
  sourceName: string;
  customerName: string;
  jobNimbusUrl: string;
  qbo: {
    invoiceId: string;
    docNumber: string | null;
    amount: number;
    balance: number;
    matchStatus: string | null;
    matchMethod: string | null;
    matchConfidence: number | null;
  } | null;
}

interface RevenueLineItemsData {
  period: { key: string; label: string; start: string; end: string };
  basis: {
    source: string;
    dateField: string;
    includedStatuses: string[];
    excluded: string;
  };
  qboStatus: {
    connected: boolean;
    company_name: string | null;
    last_sync_at: string | null;
    refresh_token_expires_at: string | null;
    status: string;
  };
  summary: {
    totalRevenue: number;
    totalPaid: number;
    totalBalance: number;
    invoiceCount: number;
    matchedToQbo: number;
    unmatchedToQbo: number;
  };
  breakdowns: {
    byStatus: RevenueBreakdownRow[];
    byType: RevenueBreakdownRow[];
    byRep: RevenueBreakdownRow[];
  };
  invoices: RevenueInvoice[];
}

function formatFullCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Missing";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <Card className="bg-[#161b22] border-[#30363d]">
      <CardContent className="pt-6">
        <p className="text-xs text-[#8b949e] mb-1">{label}</p>
        <p className="text-2xl font-bold text-[#e6edf3]">{value}</p>
        {sublabel && <p className="text-xs text-[#484f58] mt-1">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ rows }: { rows: RevenueBreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#30363d] text-left text-xs uppercase tracking-wide text-[#8b949e]">
            <th className="pb-2 pr-4 font-medium">Bucket</th>
            <th className="pb-2 pr-4 text-right font-medium">Invoices</th>
            <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
            <th className="pb-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[#21262d] last:border-0">
              <td className="py-3 pr-4 text-[#e6edf3]">{row.key}</td>
              <td className="py-3 pr-4 text-right font-mono text-[#8b949e]">{row.count}</td>
              <td className="py-3 pr-4 text-right font-mono text-[#e6edf3]">{formatFullCurrency(row.total)}</td>
              <td className="py-3 text-right font-mono text-[#8b949e]">
                {total > 0 ? `${((row.total / total) * 100).toFixed(1)}%` : "0.0%"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RevenueLineItemsPage() {
  const [period, setPeriod] = useState(() => {
    if (typeof window === "undefined") return "month";
    return new URLSearchParams(window.location.search).get("period") ?? "month";
  });
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery<RevenueLineItemsData>({
    queryKey: ["revenue-line-items", period],
    queryFn: async () => {
      const res = await fetch(`/api/revenue/line-items?period=${period}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch revenue line items");
      }
      return res.json();
    },
  });

  const filteredInvoices = useMemo(() => {
    const rows = data?.invoices ?? [];
    const q = search.trim().toLowerCase();
    const searched = q
      ? rows.filter((invoice) =>
          [
            invoice.invoiceNumber,
            invoice.customerName,
            invoice.jobName,
            invoice.salesRepName,
            invoice.recordTypeName,
            invoice.invoiceStatus,
            invoice.qbo?.docNumber,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q))
        )
      : rows;
    if (tab === "qbo") return searched.filter((invoice) => !invoice.qbo);
    return searched;
  }, [data?.invoices, search, tab]);

  const visibleTotal = filteredInvoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <Link href="/" className="text-xs text-[#58a6ff] hover:text-[#79c0ff] mb-2 inline-block">
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">Revenue Line Items</h1>
          <p className="text-sm text-[#8b949e]">
            The receipt drawer for the revenue card. If the dashboard says a number, this page shows the invoices behind it.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isError && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load revenue line items. The numbers are doing that thing where they hide behind the server logs.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 bg-[#21262d]" />)
        ) : (
          <>
            <SummaryCard
              label={`${data?.period.label ?? "Period"} revenue`}
              value={formatFullCurrency(data?.summary.totalRevenue ?? 0)}
              sublabel={`${data?.summary.invoiceCount ?? 0} invoices`}
            />
            <SummaryCard
              label="Paid against invoices"
              value={formatFullCurrency(data?.summary.totalPaid ?? 0)}
              sublabel="From JobNimbus total_paid"
            />
            <SummaryCard
              label="Open balance"
              value={formatFullCurrency(data?.summary.totalBalance ?? 0)}
              sublabel="Invoice total minus paid"
            />
            <SummaryCard
              label="Matched to QBO"
              value={`${data?.summary.matchedToQbo ?? 0}/${data?.summary.invoiceCount ?? 0}`}
              sublabel="After QBO sync + matching"
            />
            <SummaryCard
              label="QBO status"
              value={data?.qboStatus.connected ? "Connected" : "Not connected"}
              sublabel={data?.qboStatus.company_name ?? data?.qboStatus.status ?? "disconnected"}
            />
          </>
        )}
      </div>

      <Card className="bg-[#0f1a2a] border-[#1f6feb] mb-6">
        <CardContent className="p-4 text-sm text-[#8b949e]">
          <span className="font-semibold text-[#e6edf3]">Current basis:</span>{" "}
          {data?.basis.source ?? "JobNimbus invoices"}, statuses {data?.basis.includedStatuses.join(", ") ?? "Sent, Open, Closed"}, invoice date fallback to created date. QuickBooks is shown as reconciliation status, not the source of this revenue card yet.
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div className="flex flex-wrap gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1 w-fit">
          {(
            [
              { key: "all", label: "Invoices" },
              { key: "status", label: "By Status" },
              { key: "type", label: "By Type" },
              { key: "rep", label: "By Rep" },
              { key: "qbo", label: "Unmatched QBO" },
            ] as { key: TabKey; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === item.key
                  ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search invoice, customer, rep, type..."
          className="w-full lg:w-80 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none focus:border-[#58a6ff]"
        />
      </div>

      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            {tab === "all" && "Invoice detail"}
            {tab === "status" && "Revenue by invoice status"}
            {tab === "type" && "Revenue by job type"}
            {tab === "rep" && "Revenue by sales rep"}
            {tab === "qbo" && "Invoices not matched to QuickBooks"}
          </CardTitle>
          {(tab === "all" || tab === "qbo") && (
            <div className="text-xs text-[#8b949e]">
              Visible total: <span className="font-mono text-[#e6edf3]">{formatFullCurrency(visibleTotal)}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full bg-[#21262d]" />
              ))}
            </div>
          ) : tab === "status" ? (
            <BreakdownTable rows={data?.breakdowns.byStatus ?? []} />
          ) : tab === "type" ? (
            <BreakdownTable rows={data?.breakdowns.byType ?? []} />
          ) : tab === "rep" ? (
            <BreakdownTable rows={data?.breakdowns.byRep ?? []} />
          ) : filteredInvoices.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-8 text-center">No invoices match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#30363d] text-left uppercase tracking-wide text-[#8b949e]">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Invoice</th>
                    <th className="pb-2 pr-4 font-medium">Customer / Job</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Rep</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total</th>
                    <th className="pb-2 text-right font-medium">QBO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.invoiceId} className="border-b border-[#21262d] last:border-0 align-top">
                      <td className="py-3 pr-4 text-[#8b949e] whitespace-nowrap">
                        {formatDate(invoice.effectiveInvoiceDate)}
                      </td>
                      <td className="py-3 pr-4 text-[#e6edf3] whitespace-nowrap">
                        {invoice.invoiceNumber ?? invoice.invoiceId}
                      </td>
                      <td className="py-3 pr-4 min-w-[240px]">
                        <div className="font-medium text-[#e6edf3]">{invoice.customerName}</div>
                        <a
                          href={invoice.jobNimbusUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#58a6ff] hover:text-[#79c0ff]"
                        >
                          {invoice.jobName ?? invoice.jobJnid}
                        </a>
                        <div className="text-[#484f58]">{invoice.jobStatus ?? "No job status"}</div>
                      </td>
                      <td className="py-3 pr-4 text-[#8b949e] whitespace-nowrap">{invoice.recordTypeName}</td>
                      <td className="py-3 pr-4 text-[#8b949e] whitespace-nowrap">{invoice.salesRepName}</td>
                      <td className="py-3 pr-4 text-[#8b949e] whitespace-nowrap">{invoice.invoiceStatus}</td>
                      <td className="py-3 pr-4 text-right font-mono text-[#e6edf3] whitespace-nowrap">
                        {formatFullCurrency(invoice.total)}
                        <div className="text-[#484f58]">paid {formatCurrency(invoice.totalPaid)}</div>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        {invoice.qbo ? (
                          <div>
                            <span className="rounded-full bg-green-500/10 px-2 py-1 text-green-400">Matched</span>
                            <div className="mt-1 font-mono text-[#484f58]">{invoice.qbo.docNumber ?? invoice.qbo.invoiceId}</div>
                          </div>
                        ) : (
                          <span className="rounded-full bg-yellow-500/10 px-2 py-1 text-yellow-400">Not matched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
