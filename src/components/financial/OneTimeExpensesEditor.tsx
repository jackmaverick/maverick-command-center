"use client";

import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/dates";
import type { OneTimeExpense } from "@/types";

type Props = {
  expenses: OneTimeExpense[];
  horizon: string;
};

type Draft = {
  name: string;
  category: string;
  amount: string;
  expectedDate: string;
  note: string;
};

const CATEGORIES = [
  "Marketing",
  "Equipment",
  "Hiring",
  "Operations",
  "Professional Services",
  "Travel",
  "Software",
  "Other",
];

function daysFromNow(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round(
    (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "today";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
}

export default function OneTimeExpensesEditor({ expenses, horizon }: Props) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    category: "Marketing",
    amount: "",
    expectedDate: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["cashflow", horizon] });

  const createRow = useMutation({
    mutationFn: async (d: Draft) => {
      const res = await fetch(`/api/financial/expenses/one-time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name,
          category: d.category,
          amount: parseFloat(d.amount),
          expectedDate: d.expectedDate,
          note: d.note || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      setDraft({
        name: "",
        category: "Marketing",
        amount: "",
        expectedDate: new Date().toISOString().slice(0, 10),
        note: "",
      });
      setAdding(false);
      invalidate();
    },
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/financial/expenses/one-time/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card className="bg-[#161b22] border-[#30363d] mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              One-Time Planned Expenses
            </CardTitle>
            <p className="text-xs text-[#8b949e] mt-1">
              {expenses.length} scheduled · {formatCurrency(total)} total ·
              Things like &quot;$20k ad push June 15&quot; or &quot;new truck Q3&quot;
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding((v) => !v)}
            className="text-xs"
          >
            {adding ? "Cancel" : "+ Add planned spend"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="mb-4 p-3 bg-[#0d1117] border border-[#30363d] rounded-lg grid grid-cols-12 gap-2 items-end">
            <div className="col-span-3">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Name
              </label>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="e.g. Summer ad push"
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Category
              </label>
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
                className="h-8 w-full text-xs bg-[#0d1117] border border-[#30363d] rounded-md px-2 text-[#e6edf3]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Amount
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.amount}
                onChange={(e) =>
                  setDraft({ ...draft, amount: e.target.value })
                }
                placeholder="0.00"
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Expected Date
              </label>
              <Input
                type="date"
                value={draft.expectedDate}
                onChange={(e) =>
                  setDraft({ ...draft, expectedDate: e.target.value })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Note (optional)
              </label>
              <Input
                value={draft.note}
                onChange={(e) =>
                  setDraft({ ...draft, note: e.target.value })
                }
                placeholder=""
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-1">
              <Button
                size="sm"
                onClick={() => createRow.mutate(draft)}
                disabled={
                  !draft.name ||
                  !draft.amount ||
                  !draft.expectedDate ||
                  createRow.isPending
                }
                className="h-8 text-xs w-full"
              >
                {createRow.isPending ? "…" : "Save"}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#30363d]">
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Name
                </th>
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Category
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  Amount
                </th>
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Expected
                </th>
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Note
                </th>
                <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-4 text-[#8b949e]"
                  >
                    No planned one-time spend. Click &quot;Add planned
                    spend&quot; to model a future expense.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                  >
                    <td className="py-2 px-2 text-[#e6edf3]">{e.name}</td>
                    <td className="py-2 px-2 text-[#8b949e]">
                      <span className="bg-[#21262d] px-1.5 py-0.5 rounded text-[10px]">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-[#e6edf3] font-mono tabular-nums">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="py-2 px-2 text-[#8b949e]">
                      {e.expectedDate}{" "}
                      <span className="text-[10px] text-[#8b949e]/70">
                        ({daysFromNow(e.expectedDate)})
                      </span>
                    </td>
                    <td className="py-2 px-2 text-[#8b949e] text-[10px] max-w-xs truncate">
                      {e.note ?? ""}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${e.name}"?`)) {
                            deleteRow.mutate(e.id);
                          }
                        }}
                        className="text-[10px] text-[#f85149] hover:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
