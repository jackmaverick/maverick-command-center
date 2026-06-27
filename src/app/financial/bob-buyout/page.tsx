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

const MONTHLY_PAYMENT = 8_333;
const DEFAULT_BUYOUT_AMOUNT = 1_000_000;
const DEFAULT_INTEREST_FREE_PAID = 100_000;
const DEFAULT_APR = 6;
const DEFAULT_PAYMENTS_SINCE_JAN_2026 = 6;
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

function payoffSchedule(balance: number, monthlyPrincipalPayment: number, apr: number): PayoffResult {
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

function monthlySchedule(
  startingBalance: number,
  monthlyPrincipalPayment: number,
  apr: number,
  monthsToRun: number,
  startingTotalPaid = 0,
  startingTotalInterest = 0,
): MonthlyRow[] {
  const rows: MonthlyRow[] = [];
  const monthlyRate = Math.max(apr, 0) / 100 / 12;
  let balance = Math.max(startingBalance, 0);
  let totalPaid = startingTotalPaid;
  let totalInterest = startingTotalInterest;

  for (let month = 1; month <= monthsToRun && balance > 0.01; month += 1) {
    const interest = balance * monthlyRate;
    const principal = Math.max(Math.min(monthlyPrincipalPayment, balance), 0);
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
  const [buyoutAmount, setBuyoutAmount] = useState(String(DEFAULT_BUYOUT_AMOUNT));
  const [interestFreePaid, setInterestFreePaid] = useState(String(DEFAULT_INTEREST_FREE_PAID));
  const [paymentsSinceJan2026, setPaymentsSinceJan2026] = useState(
    String(DEFAULT_PAYMENTS_SINCE_JAN_2026),
  );
  const [apr, setApr] = useState(String(DEFAULT_APR));
  const [monthlyPayment, setMonthlyPayment] = useState(String(MONTHLY_PAYMENT));
  const [extraThisYear, setExtraThisYear] = useState(String(DEFAULT_EXTRA_THIS_YEAR));

  const model = useMemo(() => {
    const principal = numberValue(buyoutAmount);
    const yearOnePaid = Math.min(numberValue(interestFreePaid), principal);
    const interestBearingStart = Math.max(principal - yearOnePaid, 0);
    const elapsedMonths = Math.floor(numberValue(paymentsSinceJan2026));
    const rate = numberValue(apr);
    const payment = numberValue(monthlyPayment);
    const extra = numberValue(extraThisYear);

    const elapsedRows = monthlySchedule(interestBearingStart, payment, rate, elapsedMonths, yearOnePaid, 0);
    const lastElapsed = elapsedRows.at(-1);
    const balance = lastElapsed?.endingBalance ?? interestBearingStart;
    const paidToDate = lastElapsed?.totalPaid ?? yearOnePaid;
    const interestPaidToDate = lastElapsed?.totalInterest ?? 0;
    const principalPaid = Math.max(principal - balance, 0);
    const extraBalance = Math.max(balance - extra, 0);

    const baseline = payoffSchedule(balance, payment, rate);
    const accelerated = payoffSchedule(extraBalance, payment, rate);
    const progress = principal > 0 ? Math.min((principalPaid / principal) * 100, 100) : 0;
    const remainingProgress = principal > 0 ? Math.min((extraBalance / principal) * 100, 100) : 0;
    const upcomingRows = monthlySchedule(balance, payment, rate, 12, paidToDate, interestPaidToDate);
    const nextMonth = upcomingRows[0];

    return {
      principal,
      yearOnePaid,
      interestBearingStart,
      elapsedMonths,
      rate,
      payment,
      extra,
      balance,
      paidToDate,
      interestPaidToDate,
      principalPaid,
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
  }, [buyoutAmount, interestFreePaid, paymentsSinceJan2026, apr, monthlyPayment, extraThisYear]);

  const remainingOwed = model.balance;
  const totalPaidIfBase = model.paidToDate + model.baseline.totalPaid;
  const totalInterestIfBase = model.interestPaidToDate + model.baseline.totalInterest;
  const totalPaidIfExtra = model.paidToDate + model.extra + model.accelerated.totalPaid;
  const totalInterestIfExtra = model.interestPaidToDate + model.accelerated.totalInterest;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#58a6ff]/25 bg-[#58a6ff]/10 px-3 py-1 text-xs font-medium text-[#58a6ff]">
            Owner Buyout Tracker
          </p>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Bob Buyout Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#8b949e]">
            Tracks the $1M buyout, the $100K no-interest year-one payment, then $8,333/month principal payments plus interest starting January 2026.
          </p>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 text-sm text-[#8b949e]">
          Base principal: <span className="font-semibold text-[#e6edf3]">{dollars(model.payment)}/mo + interest</span>
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
              <Banknote className="h-4 w-4" /> Amount Owed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#e6edf3]">{compactDollars(remainingOwed)}</p>
            <p className="mt-1 text-xs text-[#8b949e]">After entered monthly adjustments</p>
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
            <p className="mt-1 text-xs text-[#8b949e]">From current owed balance</p>
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
            <p className="mt-1 text-xs text-[#8b949e]">Future interest if nothing extra is paid</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">Paid vs Owed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center justify-between text-xs text-[#8b949e]">
            <span>{dollars(model.principalPaid)} principal paid</span>
            <span>{dollars(remainingOwed)} owed</span>
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
              <p className="text-xs text-[#8b949e]">Year-one no-interest paid</p>
              <p className="mt-1 font-semibold text-[#3fb950]">{dollars(model.yearOnePaid)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Interest paid to date</p>
              <p className="mt-1 font-semibold text-[#f85149]">{dollars(model.interestPaidToDate)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Total paid to date</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.paidToDate)}</p>
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
            <Field label="Year-one no-interest paid" value={interestFreePaid} onChange={setInterestFreePaid} />
            <Field
              label="Payments made since Jan 2026"
              value={paymentsSinceJan2026}
              onChange={setPaymentsSinceJan2026}
              prefix=""
              suffix="pmts"
            />
            <Field label="Annual interest rate" value={apr} onChange={setApr} prefix="" suffix="%" />
            <Field label="Monthly principal payment" value={monthlyPayment} onChange={setMonthlyPayment} />
            <Field label="Extra added this year" value={extraThisYear} onChange={setExtraThisYear} />
            <p className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs leading-5 text-[#8b949e]">
              Model: $100K is treated as year-one principal paid with no interest. Starting Jan 2026, each month pays $8,333 toward principal plus that month’s interest.
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
                    <td className="px-4 py-3">{dollars(model.balance)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.baseline.months)}</td>
                    <td className="px-4 py-3 text-[#f85149]">{dollars(totalInterestIfBase)}</td>
                    <td className="px-4 py-3">{dollars(totalPaidIfBase)}</td>
                  </tr>
                  <tr className="bg-[#238636]/5">
                    <td className="px-4 py-3 font-medium">With extra this year</td>
                    <td className="px-4 py-3">{dollars(model.extraBalance)}</td>
                    <td className="px-4 py-3">{monthsLabel(model.accelerated.months)}</td>
                    <td className="px-4 py-3 text-[#3fb950]">{dollars(totalInterestIfExtra)}</td>
                    <td className="px-4 py-3">{dollars(totalPaidIfExtra)}</td>
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
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.nextMonth?.payment ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Interest portion</p>
              <p className="mt-1 font-semibold text-[#f85149]">{dollars(model.nextMonth?.interest ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Principal reduction</p>
              <p className="mt-1 font-semibold text-[#3fb950]">{dollars(model.nextMonth?.principal ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-[#8b949e]">Owed after next payment</p>
              <p className="mt-1 font-semibold text-[#e6edf3]">{dollars(model.nextMonth?.endingBalance ?? model.balance)}</p>
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
                    <td className="px-4 py-3 font-medium">{model.elapsedMonths + row.month}</td>
                    <td className="px-4 py-3">{dollars(row.payment)}</td>
                    <td className="px-4 py-3 text-[#f85149]">{dollars(row.interest)}</td>
                    <td className="px-4 py-3 text-[#3fb950]">{dollars(row.principal)}</td>
                    <td className="px-4 py-3">{dollars(row.totalPaid)}</td>
                    <td className="px-4 py-3">{dollars(row.totalInterest)}</td>
                    <td className="px-4 py-3">{dollars(row.endingBalance)}</td>
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
