"use client";

import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/dates";
import type { RecurringExpense } from "@/types";

type Props = {
  expenses: RecurringExpense[];
  horizon: string;
};

type Draft = {
  name: string;
  category: string;
  amount: string;
  frequency: RecurringExpense["frequency"];
  notes: string;
};

const emptyDraft: Draft = {
  name: "",
  category: "Overhead",
  amount: "",
  frequency: "monthly",
  notes: "",
};

const CATEGORIES = [
  "Payroll",
  "Overhead",
  "Marketing",
  "Operations",
  "Financing",
  "Insurance",
  "Software",
  "Other",
];

function ConfidencePill({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;
  const color =
    confidence === "high"
      ? "bg-green-500/10 text-green-400"
      : confidence === "medium"
        ? "bg-yellow-500/10 text-yellow-400"
        : "bg-red-500/10 text-red-400";
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}
      title="AI-seeded confidence level. Review with accountant."
    >
      {confidence}
    </span>
  );
}

export default function RecurringExpensesEditor({ expenses, horizon }: Props) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["cashflow", horizon] });

  const patchAmount = useMutation({
    mutationFn: async (vars: { id: string; amount: number }) => {
      const res = await fetch(
        `/api/financial/expenses/recurring/${vars.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: vars.amount }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const endDateRow = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/financial/expenses/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: today }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const createRow = useMutation({
    mutationFn: async (d: Draft) => {
      const res = await fetch(`/api/financial/expenses/recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name,
          category: d.category,
          amount: parseFloat(d.amount),
          frequency: d.frequency,
          notes: d.notes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      setDraft(emptyDraft);
      setAdding(false);
      invalidate();
    },
  });

  const totalMonthly = expenses.reduce((sum, e) => {
    const mult =
      e.frequency === "weekly"
        ? 4.33
        : e.frequency === "biweekly"
          ? 2.17
          : e.frequency === "quarterly"
            ? 1 / 3
            : e.frequency === "annual"
              ? 1 / 12
              : 1;
    return sum + e.amount * mult;
  }, 0);

  const startEdit = (e: RecurringExpense) => {
    setEditingId(e.id);
    setEditAmount(e.amount.toString());
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const n = parseFloat(editAmount);
    if (!Number.isFinite(n) || n < 0) return;
    await patchAmount.mutateAsync({ id: editingId, amount: n });
    setEditingId(null);
  };

  return (
    <Card className="bg-[#161b22] border-[#30363d] mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Recurring Expenses
            </CardTitle>
            <p className="text-xs text-[#8b949e] mt-1">
              Total monthly: {formatCurrency(totalMonthly)} · Edit amounts or
              end-date rows when they stop (non-destructive — history
              preserved).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding((v) => !v)}
            className="text-xs"
          >
            {adding ? "Cancel" : "+ Add row"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="mb-4 p-3 bg-[#0d1117] border border-[#30363d] rounded-lg grid grid-cols-12 gap-2 items-end">
            <div className="col-span-4">
              <label className="text-[10px] text-[#8b949e] uppercase">
                Name
              </label>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="e.g. Rent, Jose salary"
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
                Frequency
              </label>
              <select
                value={draft.frequency}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    frequency: e.target.value as Draft["frequency"],
                  })
                }
                className="h-8 w-full text-xs bg-[#0d1117] border border-[#30363d] rounded-md px-2 text-[#e6edf3]"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-1">
              <Button
                size="sm"
                onClick={() => createRow.mutate(draft)}
                disabled={
                  !draft.name ||
                  !draft.amount ||
                  createRow.isPending
                }
                className="h-8 text-xs flex-1"
              >
                {createRow.isPending ? "Saving…" : "Save"}
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
                  Frequency
                </th>
                <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                  Source
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
                    No recurring expenses yet. Click &quot;Add row&quot; to
                    start.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                    title={e.notes ?? undefined}
                  >
                    <td className="py-2 px-2 text-[#e6edf3]">{e.name}</td>
                    <td className="py-2 px-2 text-[#8b949e]">
                      <span className="bg-[#21262d] px-1.5 py-0.5 rounded text-[10px]">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {editingId === e.id ? (
                        <div className="flex gap-1 justify-end items-center">
                          <Input
                            type="number"
                            value={editAmount}
                            onChange={(ev) =>
                              setEditAmount(ev.target.value)
                            }
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") saveEdit();
                              if (ev.key === "Escape")
                                setEditingId(null);
                            }}
                            className="h-6 text-xs w-24"
                            autoFocus
                          />
                          <button
                            onClick={saveEdit}
                            className="text-[10px] text-green-400"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-[10px] text-[#8b949e]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(e)}
                          className="text-[#e6edf3] hover:text-[#58a6ff]"
                        >
                          {formatCurrency(e.amount)}
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[#8b949e] capitalize">
                      {e.frequency}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1 items-center">
                        {e.source === "ai_seeded" && (
                          <span
                            className="text-[10px] text-[#58a6ff]"
                            title="AI-derived from P&L. Review with accountant."
                          >
                            AI
                          </span>
                        )}
                        {e.source === "manual" && (
                          <span className="text-[10px] text-[#8b949e]">
                            manual
                          </span>
                        )}
                        <ConfidencePill confidence={e.confidence} />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `End-date "${e.name}" as of today? (Non-destructive — row kept for history.)`
                            )
                          ) {
                            endDateRow.mutate(e.id);
                          }
                        }}
                        className="text-[10px] text-[#f85149] hover:text-red-400"
                      >
                        End-date
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
