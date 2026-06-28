"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  Banknote,
  Calculator,
  Clock,
  Gauge,
  PiggyBank,
  ReceiptText,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_BUYOUT_AMOUNT = 1_000_000;
const DEFAULT_2025_PAYMENT_COUNT = 10;
const DEFAULT_2026_PAYMENT_COUNT = 6;
const DEFAULT_2026_START_BALANCE = 916_166.7;
const DEFAULT_MONTHLY_PRINCIPAL_PAYMENT = 8_333.33;
const DEFAULT_MONTHLY_INTEREST_PAYMENT = 4_945.31;
const DEFAULT_EXTRA_THIS_YEAR = 50_000;

interface PayoffResult {
  months: number;
  years: number;
  totalPaid: number;
  totalInterest: number;
  finalBalance: number;
}

interface MonthlyRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
  totalPaid: number;
  totalInterest: number;
}

function dollars(value: number, cents = false): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
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

function payoffSchedule(
  balance: number,
  monthlyPrincipalPayment: number,
  monthlyInterestPayment: number,
): PayoffResult {
  if (balance <= 0) {
    return { months: 0, years: 0, totalPaid: 0, totalInterest: 0, finalBalance: 0 };
  }

  let remaining = balance;
  let months = 0;
  let totalPaid = 0;
  let totalInterest = 0;

  while (remaining > 0.01 && months < 600) {
    const principalPayment = Math.min(monthlyPrincipalPayment, remaining);

    if (principalPayment <= 0) {
      return {
        months: 600,
        years: 50,
        totalPaid,
        totalInterest,
        finalBalance: remaining,
      };
    }

    remaining = Math.max(remaining - principalPayment, 0);
    totalInterest += monthlyInterestPayment;
    totalPaid += principalPayment + monthlyInterestPayment;
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

function monthlySchedule(
  startingBalance: number,
  monthlyPrincipalPayment: number,
  monthlyInterestPayment: number,
  monthsToRun: number,
  startingTotalPaid = 0,
  startingTotalInterest = 0,
): MonthlyRow[] {
  const rows: MonthlyRow[] = [];
  let balance = Math.max(startingBalance, 0);
  let totalPaid = startingTotalPaid;
  let totalInterest = startingTotalInterest;

  for (let month = 1; month <= monthsToRun && balance > 0.01; month += 1) {
    const principal = Math.max(Math.min(monthlyPrincipalPayment, balance), 0);
    const interest = monthlyInterestPayment;
    const payment = principal + interest;

    if (principal <= 0) break;

    balance = Math.max(balance - principal, 0);
    totalPaid += payment;
    totalInterest += interest;

    rows.push({
      month,
      payment,
      interest,
      principal,
      endingBalance: balance,
      totalPaid,
      totalInterest,
    });
  }

  return rows;
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
          } ${suffix ? "pr-14" : ""}`}
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
  const [buyoutAmount, setBuyoutAmount] = useState(String(DEFAULT_BUYOUT_AMOUNT));
  const [payments2025, setPayments2025] = useState(String(DEFAULT_2025_PAYMENT_COUNT));
  const [start2026Balance, setStart2026Balance] = useState(String(DEFAULT_2026_START_BALANCE));
  const [payments2026, setPayments2026] = useState(String(DEFAULT_2026_PAYMENT_COUNT));
  const [monthlyPrincipal, setMonthlyPrincipal] = useState(String(DEFAULT_MONTHLY_PRINCIPAL_PAYMENT));
  const [monthlyInterest, setMonthlyInterest] = useState(String(DEFAULT_MONTHLY_INTEREST_PAYMENT));
  const [extraThisYear, setExtraThisYear] = useState(String(DEFAULT_EXTRA_THIS_YEAR));

  const model = useMemo(() => {
    const principal = numberValue(buyoutAmount);
    const paymentCount2025 = Math.floor(numberValue(payments2025));
    const paymentCount2026 = Math.floor(numberValue(payments2026));
    const beginning2026Balance = Math.min(numberValue(start2026Balance), principal);
    const principalPayment = numberValue(monthlyPrincipal);
    const interestPayment = numberValue(monthlyInterest);
    const extra = numberValue(extraThisYear);

    const cashPrincipalPaid2025 = paymentCount2025 * principalPayment;
    const principalCreditedBefore2026 = Math.max(principal - beginning2026Balance, 0);
    const balanceAdjustment = principalCreditedBefore2026 - cashPrincipalPaid2025;
    const principalPaid2026 = Math.min(paymentCount2026 * principalPayment, beginning2026Balance);
    const interestPaid2026 = paymentCount2026 * interestPayment;
    const balance = Math.max(beginning2026Balance - principalPaid2026, 0);
    const principalCredited = Math.max(principal - balance, 0);
    const cashPrincipalPaid = cashPrincipalPaid2025 + principalPaid2026;
    const cashPaidToDate = cashPrincipalPaid + interestPaid2026;
    const impliedApr = beginning2026Balance > 0 ? (interestPayment / beginning2026Balance) * 12 * 100 : 0;
    const extraBalance = Math.max(balance - extra, 0);

    const baseline = payoffSchedule(balance, principalPayment, interestPayment);
    const accelerated = payoffSchedule(extraBalance, principalPayment, interestPayment);
    const progress = principal > 0 ? Math.min((principalCredited / principal) * 100, 100) : 0;
    const remainingProgress = principal > 0 ? Math.min((extraBalance / principal) * 100, 100) : 0;
    const upcomingRows = monthlySchedule(
      balance,
      principalPayment,
      interestPayment,
      12,
      cashPaidToDate,
      interestPaid2026,
    );
    const nextMonth = upcomingRows[0];

    return {
      principal,
      paymentCount2025,
      paymentCount2026,
      beginning2026Balance,
      principalPayment,
      interestPayment,
      totalMonthlyPayment: principalPayment + interestPayment,
      extra,
      cashPrincipalPaid2025,
      principalCreditedBefore2026,
      balanceAdjustment,
      principalPaid2026,
      interestPaid2026,
      balance,
      principalCredited,
      cashPrincipalPaid,
      cashPaidToDate,
      impliedApr,
      extraBalance,
      baseline,
      accelerated,
      progress,
      remainingProgress,
      upcomingRows,
      nextMonth,
      interestSaved: Math.max(baseline.totalInterest - accelerated.totalInterest, 0),
      monthsSaved: Math.max(baseline.months - accelerated.months, 0),
    };
  }, [buyoutAmount, payments2025, start2026Balance, payments2026, monthlyPrincipal, monthlyInterest, extraThisYear]);

  const totalPaidIfBase = model.cashPaidToDate + model.baseline.totalPaid;
  const totalInterestIfBase = model.interestPaid2026 + model.baseline.totalInterest;
  const totalPaidIfExtra = model.cashPaidToDate + model.extra + model.accelerated.totalPaid;
  const totalInterestIfExtra = model.interestPaid2026 + model.accelerated.totalInterest;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#58a6ff]/25 bg-[#58a6ff]/10 px-3 py-1 text-xs font-medium text-[#58a6ff]">
            Owner Buyout Tracker
          </p>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Bob Buyout Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#8b949e]">
            Tracks the $1M buyout using Brent’s payment history: 10 principal payments in 2025, no upfront payment, then monthly principal plus interest in 2026.
          </p>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 text-sm text-[#8b949e]">
          Monthly payment: <span className="font-semibold text-[#e6edf3]">{dollars(model.totalMonthlyPayment, true)}</span>
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
            <p className="mt-1 text-xs text-[#8b949e]">{dollars(model.principalCredited, true)} credited toward principal</p>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <Banknote className="h-4 w-4" /> Amount Owed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#e6edf3]">{compactDollars(model.balance)}</p>
            <p className="mt-1 text-xs text-[#8b949e]">{dollars(model.balance, true)} after 2026 payments</p>
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
            <p className="mt-1 text-xs text-[#8b949e]">At {dollars(model.principalPayment, true)}/mo principal</p>
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
            <p className="mt-1 text-xs text-[#8b949e]">At {dollars(model.interestPayment, true)}/mo interest</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">Paid vs Owed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center justify-between text-xs text-[#8b949e]">
            <span>{dollars(model.principalCredited, true)} credited toward principal</span>
            <span>{dollars(model.balance, true)} owed</span>
          </div>
          <div className="h-5 overflow-hidden rounded-full bg-[#0d1117] ring-1 ring-[#30363d]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#238636] to-[#3fb950] transition-all"
              style={{ width: `${model.progress}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Total buyout</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.principal)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">2025 principal paid</p>
              <p className="mt-1 font-semibold text-[#3fb950]">{dollars(model.cashPrincipalPaid2025, true)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">2026 interest paid</p>
              <p className="mt-1 font-semibold text-[#f85149]">{dollars(model.interestPaid2026, true)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Cash paid to date</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.cashPaidToDate, true)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#e6edf3]">
              <Calculator className="h-4 w-4" /> Calculator Inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Total buyout amount" value={buyoutAmount} onChange={setBuyoutAmount} />
            <Field label="2025 payments made" value={payments2025} onChange={setPayments2025} prefix="" suffix="pmts" />
            <Field label="Balance entering 2026" value={start2026Balance} onChange={setStart2026Balance} />
            <Field label="2026 payments made" value={payments2026} onChange={setPayments2026} prefix="" suffix="pmts" />
            <Field label="Monthly principal payment" value={monthlyPrincipal} onChange={setMonthlyPrincipal} />
            <Field label="Monthly interest payment" value={monthlyInterest} onChange={setMonthlyInterest} />
            <Field label="Extra added this year" value={extraThisYear} onChange={setExtraThisYear} />
            <p className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs leading-5 text-[#8b949e]">
              Model: no upfront payment. 2025 had {model.paymentCount2025} principal payments. Brent’s 2026 starting balance is treated as the owed balance, then 2026 principal and interest payments are applied from there. Implied annual rate is about {model.impliedApr.toFixed(2)}% based on {dollars(model.interestPayment, true)} monthly interest against the 2026 starting balance.
            </p>
            {Math.abs(model.balanceAdjustment) > 0.01 && (
              <p className="rounded-lg border border-[#d29922]/40 bg-[#d29922]/10 p-3 text-xs leading-5 text-[#d29922]">
                Data check: 10 × {dollars(model.principalPayment, true)} equals {dollars(model.cashPrincipalPaid2025, true)}, while the provided 2026 balance implies {dollars(model.principalCreditedBefore2026, true)} credited before 2026. Difference: {dollars(model.balanceAdjustment, true)}.
              </p>
            )}
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
                <p className="mt-3 text-3xl font-bold text-[#3fb950]">{dollars(model.interestSaved, true)}</p>
                <p className="mt-1 text-xs text-[#8b949e]">Savings from adding {dollars(model.extra, true)}</p>
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
                  <ArrowDownRight className="h-4 w-4" /> New amount owed
                </div>
                <p className="mt-3 text-3xl font-bold text-[#d29922]">{compactDollars(model.extraBalance)}</p>
                <p className="mt-1 text-xs text-[#8b949e]">{model.remainingProgress.toFixed(1)}% of original buyout left</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#30363d]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Scenario</th>
                    <th className="px-4 py-3 font-medium">Amount owed</th>
                    <th className="px-4 py-3 font-medium">Payoff time</th>
                    <th className="px-4 py-3 font-medium">Total interest</th>
                    <th className="px-4 py-3 font-medium">Total paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d] text-[#e6edf3]">
                  <tr>
                    <td className="px-4 py-3 font-medium">Base plan</td>
                    <td className="px-4 py-3">{dollars(model.balance, true)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.baseline.months)}</td>
                    <td className="px-4 py-3 text-[#f85149]">{dollars(totalInterestIfBase, true)}</td>
                    <td className="px-4 py-3">{dollars(totalPaidIfBase, true)}</td>
                  </tr>
                  <tr className="bg-[#238636]/5">
                    <td className="px-4 py-3 font-medium">With extra this year</td>
                    <td className="px-4 py-3">{dollars(model.extraBalance, true)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.accelerated.months)}</td>
                    <td className="px-4 py-3 text-[#3fb950]">{dollars(totalInterestIfExtra, true)}</td>
                    <td className="px-4 py-3">{dollars(totalPaidIfExtra, true)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#e6edf3]">
            <ReceiptText className="h-4 w-4" /> Monthly Adjustment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Next payment</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.nextMonth?.payment ?? 0, true)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Interest portion</p>
              <p className="mt-1 font-semibold text-[#f85149]">{dollars(model.nextMonth?.interest ?? 0, true)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Principal reduction</p>
              <p className="mt-1 font-semibold text-[#3fb950]">{dollars(model.nextMonth?.principal ?? 0, true)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Owed after next payment</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.nextMonth?.endingBalance ?? model.balance, true)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#30363d]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Interest</th>
                  <th className="px-4 py-3 font-medium">Principal</th>
                  <th className="px-4 py-3 font-medium">Total paid</th>
                  <th className="px-4 py-3 font-medium">Total interest</th>
                  <th className="px-4 py-3 font-medium">Amount owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d] text-[#e6edf3]">
                {model.upcomingRows.map((row) => (
                  <tr key={row.month}>
                    <td className="px-4 py-3 font-medium">{model.paymentCount2026 + row.month}</td>
                    <td className="px-4 py-3">{dollars(row.payment, true)}</td>
                    <td className="px-4 py-3 text-[#f85149]">{dollars(row.interest, true)}</td>
                    <td className="px-4 py-3 text-[#3fb950]">{dollars(row.principal, true)}</td>
                    <td className="px-4 py-3">{dollars(row.totalPaid, true)}</td>
                    <td className="px-4 py-3">{dollars(row.totalInterest, true)}</td>
                    <td className="px-4 py-3">{dollars(row.endingBalance, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
