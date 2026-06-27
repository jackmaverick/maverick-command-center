"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  Banknote,
  Calculator,
  Clock,
  Gauge,
  PiggyBank,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MONTHLY_PAYMENT = 8_333;
const DEFAULT_PRINCIPAL = 500_000;
const DEFAULT_APR = 6;
const DEFAULT_EXTRA_THIS_YEAR = 50_000;

interface PayoffResult {
  months: number;
  years: number;
  totalPaid: number;
  totalInterest: number;
  finalBalance: number;
}

function dollars(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function compactDollars(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return dollars(value);
}

function numberValue(value: string): number {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function payoffSchedule(balance: number, monthlyPayment: number, apr: number): PayoffResult {
  if (balance <= 0) {
    return { months: 0, years: 0, totalPaid: 0, totalInterest: 0, finalBalance: 0 };
  }

  const monthlyRate = Math.max(apr, 0) / 100 / 12;
  let remaining = balance;
  let months = 0;
  let totalPaid = 0;
  let totalInterest = 0;

  while (remaining > 0.01 && months < 600) {
    const interest = remaining * monthlyRate;
    const principalPayment = Math.min(monthlyPayment - interest, remaining);

    if (principalPayment <= 0) {
      return {
        months: 600,
        years: 50,
        totalPaid,
        totalInterest,
        finalBalance: remaining,
      };
    }

    remaining -= principalPayment;
    totalInterest += interest;
    totalPaid += principalPayment + interest;
    months += 1;
  }

  return {
    months,
    years: months / 12,
    totalPaid,
    totalInterest,
    finalBalance: Math.max(remaining, 0),
  };
}

function monthsLabel(months: number): string {
  if (months >= 600) return "No payoff at current payment";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years === 0) return `${remainder} mo`;
  if (remainder === 0) return `${years} yr`;
  return `${years} yr ${remainder} mo`;
}

function Field({
  label,
  value,
  onChange,
  prefix = "$",
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#8b949e]">
        {label}
      </span>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#8b949e]">
            {prefix}
          </span>
        )}
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          className={`border-[#30363d] bg-[#0d1117] text-[#e6edf3] placeholder:text-[#6e7681] ${
            prefix ? "pl-7" : ""
          } ${suffix ? "pr-12" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8b949e]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export default function BobBuyoutPage() {
  const [originalPrincipal, setOriginalPrincipal] = useState(String(DEFAULT_PRINCIPAL));
  const [currentBalance, setCurrentBalance] = useState(String(DEFAULT_PRINCIPAL));
  const [apr, setApr] = useState(String(DEFAULT_APR));
  const [monthlyPayment, setMonthlyPayment] = useState(String(MONTHLY_PAYMENT));
  const [extraThisYear, setExtraThisYear] = useState(String(DEFAULT_EXTRA_THIS_YEAR));

  const model = useMemo(() => {
    const principal = numberValue(originalPrincipal);
    const balance = Math.min(numberValue(currentBalance), principal || Number.MAX_SAFE_INTEGER);
    const rate = numberValue(apr);
    const payment = numberValue(monthlyPayment);
    const extra = numberValue(extraThisYear);
    const extraBalance = Math.max(balance - extra, 0);

    const baseline = payoffSchedule(balance, payment, rate);
    const accelerated = payoffSchedule(extraBalance, payment, rate);
    const principalPaid = Math.max(principal - balance, 0);
    const progress = principal > 0 ? Math.min((principalPaid / principal) * 100, 100) : 0;
    const remainingProgress = principal > 0 ? Math.min((extraBalance / principal) * 100, 100) : 0;

    return {
      principal,
      balance,
      rate,
      payment,
      extra,
      extraBalance,
      baseline,
      accelerated,
      principalPaid,
      progress,
      remainingProgress,
      interestSaved: Math.max(baseline.totalInterest - accelerated.totalInterest, 0),
      monthsSaved: Math.max(baseline.months - accelerated.months, 0),
    };
  }, [originalPrincipal, currentBalance, apr, monthlyPayment, extraThisYear]);

  const monthlyInterest = (model.balance * (model.rate / 100)) / 12;
  const monthlyPrincipal = Math.max(model.payment - monthlyInterest, 0);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#58a6ff]/25 bg-[#58a6ff]/10 px-3 py-1 text-xs font-medium text-[#58a6ff]">
            Owner Buyout Tracker
          </p>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Bob Buyout Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#8b949e]">
            Tracks the seller-note payoff against the $8,333/month obligation and shows what extra cash this year does to interest and timeline.
          </p>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 text-sm text-[#8b949e]">
          Base payment: <span className="font-semibold text-[#e6edf3]">{dollars(model.payment)}/mo</span>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <Gauge className="h-4 w-4" /> Goal Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#3fb950]">{model.progress.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-[#8b949e]">{dollars(model.principalPaid)} principal paid</p>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <Banknote className="h-4 w-4" /> Remaining Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#e6edf3]">{compactDollars(model.balance)}</p>
            <p className="mt-1 text-xs text-[#8b949e]">Before any extra paydown</p>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <Clock className="h-4 w-4" /> Current Payoff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#d29922]">{monthsLabel(model.baseline.months)}</p>
            <p className="mt-1 text-xs text-[#8b949e]">Projected at current terms</p>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <TrendingDown className="h-4 w-4" /> Interest Ahead
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#f85149]">{compactDollars(model.baseline.totalInterest)}</p>
            <p className="mt-1 text-xs text-[#8b949e]">If nothing extra is paid</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">Distance to Goal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center justify-between text-xs text-[#8b949e]">
            <span>{dollars(model.principalPaid)} paid</span>
            <span>{dollars(model.balance)} left</span>
          </div>
          <div className="h-5 overflow-hidden rounded-full bg-[#0d1117] ring-1 ring-[#30363d]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#238636] to-[#3fb950] transition-all"
              style={{ width: `${model.progress}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Original buyout goal</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.principal)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">This month’s interest drag</p>
              <p className="mt-1 font-semibold text-[#f85149]">{dollars(monthlyInterest)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">This month’s principal reduction</p>
              <p className="mt-1 font-semibold text-[#3fb950]">{dollars(monthlyPrincipal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#e6edf3]">
              <Calculator className="h-4 w-4" /> Calculator Inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Original buyout amount" value={originalPrincipal} onChange={setOriginalPrincipal} />
            <Field label="Current balance" value={currentBalance} onChange={setCurrentBalance} />
            <Field label="Annual interest rate" value={apr} onChange={setApr} prefix="" suffix="%" />
            <Field label="Monthly payment" value={monthlyPayment} onChange={setMonthlyPayment} />
            <Field label="Extra added this year" value={extraThisYear} onChange={setExtraThisYear} />
            <p className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs leading-5 text-[#8b949e]">
              Assumption: the extra amount hits principal now. If the actual note compounds differently, this still gets close enough for operating decisions, which is what we need before the spreadsheet goblins arrive.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">What Extra Cash Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#238636]/30 bg-[#238636]/10 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#3fb950]">
                  <PiggyBank className="h-4 w-4" /> Interest saved
                </div>
                <p className="mt-3 text-3xl font-bold text-[#3fb950]">{dollars(model.interestSaved)}</p>
                <p className="mt-1 text-xs text-[#8b949e]">Savings from adding {dollars(model.extra)}</p>
              </div>
              <div className="rounded-xl border border-[#58a6ff]/30 bg-[#58a6ff]/10 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#58a6ff]">
                  <Clock className="h-4 w-4" /> Time saved
                </div>
                <p className="mt-3 text-3xl font-bold text-[#58a6ff]">{monthsLabel(model.monthsSaved)}</p>
                <p className="mt-1 text-xs text-[#8b949e]">Earlier payoff vs base plan</p>
              </div>
              <div className="rounded-xl border border-[#d29922]/30 bg-[#d29922]/10 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#d29922]">
                  <ArrowDownRight className="h-4 w-4" /> New balance
                </div>
                <p className="mt-3 text-3xl font-bold text-[#d29922]">{compactDollars(model.extraBalance)}</p>
                <p className="mt-1 text-xs text-[#8b949e]">{model.remainingProgress.toFixed(1)}% of original note left</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#30363d]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Scenario</th>
                    <th className="px-4 py-3 font-medium">Balance</th>
                    <th className="px-4 py-3 font-medium">Payoff time</th>
                    <th className="px-4 py-3 font-medium">Interest paid</th>
                    <th className="px-4 py-3 font-medium">Total cash out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d] text-[#e6edf3]">
                  <tr>
                    <td className="px-4 py-3 font-medium">Base plan</td>
                    <td className="px-4 py-3">{dollars(model.balance)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.baseline.months)}</td>
                    <td className="px-4 py-3 text-[#f85149]">{dollars(model.baseline.totalInterest)}</td>
                    <td className="px-4 py-3">{dollars(model.baseline.totalPaid)}</td>
                  </tr>
                  <tr className="bg-[#238636]/5">
                    <td className="px-4 py-3 font-medium">With extra this year</td>
                    <td className="px-4 py-3">{dollars(model.extraBalance)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.accelerated.months)}</td>
                    <td className="px-4 py-3 text-[#3fb950]">{dollars(model.accelerated.totalInterest)}</td>
                    <td className="px-4 py-3">{dollars(model.extra + model.accelerated.totalPaid)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
