"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/dates";
import type { PlanVsActualMonth } from "@/types";

type Props = {
  months: PlanVsActualMonth[];
};

export default function PlanVsActualTable({ months }: Props) {
  const hasAnyActual = months.some((m) => m.actual !== null);

  return (
    <Card className="bg-[#161b22] border-[#30363d] mb-8">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-[#e6edf3]">
          Plan vs Actual — Trailing 3 Months
        </CardTitle>
        <p className="text-xs text-[#8b949e] mt-1">
          What we modeled would happen vs what QuickBooks says actually
          happened. Negative variance = under budget. Only overhead expenses
          (not COGS) — COGS scales with revenue.
        </p>
      </CardHeader>
      <CardContent>
        {!hasAnyActual && (
          <div className="mb-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg text-xs text-yellow-400/80">
            QuickBooks actuals aren&apos;t flowing yet. Once QBO production
            approval lands and the connection is live, actual spend for these
            months will appear here automatically. Planned values work
            independently.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#30363d]">
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Month
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  Planned
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  Actual (QBO)
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  Variance
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const varianceColor =
                  m.variance === null
                    ? "text-[#8b949e]"
                    : m.variance <= 0
                      ? "text-[#3fb950]"
                      : m.variance < (m.planned ?? 0) * 0.1
                        ? "text-[#d29922]"
                        : "text-[#f85149]";
                return (
                  <tr
                    key={m.monthKey}
                    className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                  >
                    <td className="py-2 px-2 text-[#e6edf3] font-medium">
                      {m.month}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-[#e6edf3]">
                      {formatCurrency(m.planned)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-[#8b949e]">
                      {m.actual === null ? "—" : formatCurrency(m.actual)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-mono tabular-nums ${varianceColor}`}
                    >
                      {m.variance === null
                        ? "—"
                        : `${m.variance >= 0 ? "+" : ""}${formatCurrency(m.variance)}`}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-mono tabular-nums ${varianceColor}`}
                    >
                      {m.variancePercent === null
                        ? "—"
                        : `${m.variancePercent >= 0 ? "+" : ""}${m.variancePercent}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
