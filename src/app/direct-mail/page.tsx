"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import type { WeeklyReview, WeeklyAction } from "@/lib/direct-mail/weekly";
import {
  campaignMix,
  invoicePricing,
  piecesForBudget,
  projectedCost,
} from "@/lib/direct-mail/pricing";
import JobProfit, {
  CampaignJobProfit,
  useJobProfits,
} from "@/components/direct-mail/job-profit";
import MailingCosts, { MailReturns } from "@/components/direct-mail/mailing-costs";
import {
  allInProjection,
  grossProfitPerDollar,
  cashTotals,
  mailingCosts,
  perDollarReturn,
  returnMetrics,
} from "@/lib/direct-mail/costs";
import { profitTotals } from "@/lib/direct-mail/profit";
import { monthlyMailVolume } from "@/lib/direct-mail/volume";
import {
  audienceLabels,
  campaignClassificationCoverage,
  campaignStrategyPerformance,
  touchLabels,
} from "@/lib/direct-mail/strategy";
import NeighborhoodOpportunities from "@/components/direct-mail/neighborhood-opportunities";
import MailingProof from "@/components/direct-mail/mailing-proof";
import styles from "./weekly.module.css";

const tabs = [
  "Overview",
  "Next sends",
  "Budget planner",
  "Mailing costs",
  "Monthly results",
  "List performance",
  "Job profit",
  "Roof opportunities",
  "Neighborhoods & signs",
  "Audience",
  "Evidence",
  "Mailing proof",
] as const;
type Tab = (typeof tabs)[number];
const num = (n: number) => new Intl.NumberFormat("en-US").format(n);
const money = (n: number | null) =>
  n === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);
const exactMoney = (n: number | null) =>
  n === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);
const day = (d: string | null) =>
  d
    ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Unconfirmed";
const monthLabel = (m: string) =>
  new Date(m + "-01T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const unitMoney = (n: number | null) =>
  n === null ? "Unknown" : `$${n.toFixed(4)}`;
function exportUrl(
  id: string,
  view: string,
  filters: Record<string, string> = {},
) {
  return (
    "/api/direct-mail/weekly/export?" +
    new URLSearchParams({ id, view, ...filters }).toString()
  );
}
function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "green" | "amber" | "blue";
}) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>;
}
function Panel({
  title,
  detail,
  children,
  aside,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.notice}>
      <CircleAlert size={17} />
      <p>{children}</p>
    </div>
  );
}
function ActionCard({
  a,
  asOf,
  rate,
}: {
  a: WeeklyAction;
  asOf: string;
  rate: number | null;
}) {
  return (
    <article className={styles.action}>
      <div className={styles.actionTop}>
        <span className={styles.rank}>
          {String(a.priority).padStart(2, "0")}
        </span>
        <div>
          <span className={styles.eyebrow}>{a.lane}</span>
          <h3>{a.neighborhood}</h3>
        </div>
        <Pill tone={a.status === "Hold" ? "amber" : "blue"}>{a.status}</Pill>
      </div>
      <p>{a.reason}</p>
      <div className={styles.nextStep}>
        <ArrowRight size={16} />
        <span>{a.nextStep}</span>
      </div>
      <div className={styles.actionMeta}>
        <span>
          <CalendarDays size={14} />
          Review {day(a.due)}
          {a.due < asOf ? " · overdue at review" : ""}
        </span>
        {a.install && (
          <span>
            <MapPin size={14} />
            Roof {day(a.install)}
          </span>
        )}
        {a.proposedQuantity !== null && (
          <span>
            Up to {num(a.proposedQuantity)} homes · proposed · Est. Ron cost{" "}
            {exactMoney(projectedCost(a.proposedQuantity, rate))}
          </span>
        )}
      </div>
      <details>
        <summary>
          {a.gates.length} checks before approval <ChevronRight size={14} />
        </summary>
        <ul>
          {a.gates.map((g) => (
            <li key={g}>
              <span className={styles.emptyCheck} />
              {g}
            </li>
          ))}
        </ul>
        <p className={styles.caption}>
          {a.owner}. Preparation only; no mailing approved.
        </p>
      </details>
    </article>
  );
}
function Overview({ d, onTab }: { d: WeeklyReview; onTab: (t: Tab) => void }) {
  const volume = monthlyMailVolume(d);
  const strategyRows = campaignStrategyPerformance(d);
  const strategyCoverage = campaignClassificationCoverage(d);
  const monthlySpendTarget = 25_000;
  const monthlyPieceTarget = 50_000;
  const invoiceRate = invoicePricing(d.invoices).rate;
  const postageInclusiveRate = allInProjection(d);
  const ronPiecesAtTarget = piecesForBudget(monthlySpendTarget, invoiceRate);
  const allInPiecesAtTarget = piecesForBudget(
    monthlySpendTarget,
    postageInclusiveRate,
  );
  const allInLowTarget = projectedCost(40_000, postageInclusiveRate);
  const allInHighTarget = projectedCost(50_000, postageInclusiveRate);
  return (
    <>
      <div className={styles.overviewGrid}>
        <section className={styles.hero}>
          <Pill tone="green">
            <TrendingUp size={13} />
            This week’s focus
          </Pill>
          <h2>
            Follow up where the
            <br />
            signal is strongest.
          </h2>
          <p>
            Start with recent responses, then use scheduled roofs to make the
            next mailing locally relevant. Every resend needs a fresh recipient
            check.
          </p>
          <button
            className={styles.primary}
            onClick={() => onTab("Next sends")}
          >
            Review next sends <ArrowRight size={16} />
          </button>
          <div className={styles.heroFoot}>
            {d.actions.filter((a) => a.status !== "Hold").length} preparation
            opportunities ·{" "}
            {d.actions.filter((a) => a.status === "Hold").length} on hold ·
            budget{" "}
            {d.summary.budget === null ? "unset" : money(d.summary.budget)}
          </div>
        </section>
        <Panel
          title="Lead & mailing momentum"
          detail="Monthly leads, requested rows and strongest available piece evidence"
        >
          <div className={styles.volumeTarget}>
            <div>
              <span>Growth planning target</span>
              <strong>40,000–50,000 pieces / month</strong>
            </div>
            <small>
              $25,000 ≈{" "}
              {ronPiecesAtTarget === null ? "unknown" : num(ronPiecesAtTarget)}
              {" "}pieces at Ron&apos;s rate ·{" "}
              {allInPiecesAtTarget === null
                ? "unknown"
                : num(allInPiecesAtTarget)}{" "}
              with the current postage model
              <br />
              40,000–50,000 pieces ≈ {money(allInLowTarget)}–
              {money(allInHighTarget)} all-in · $1M added-revenue scenario
            </small>
          </div>
          <div className={styles.volumeList}>
            {volume.map((m) => (
              <div className={styles.volumeRow} key={m.month}>
                <div className={styles.volumeMonth}>
                  <strong>{monthLabel(m.month).split(" ")[0]}</strong>
                  <span>{m.leads} leads</span>
                </div>
                <div className={styles.volumeProgress}>
                  <div className={styles.volumeTrack}>
                    <div
                      style={{
                        width: `${Math.min(((m.documentedPieces ?? 0) / monthlyPieceTarget) * 100, 100)}%`,
                      }}
                      className={
                        m.month === d.asOf.slice(0, 7)
                          ? styles.currentVolume
                          : styles.volumeFill
                      }
                    />
                  </div>
                  <span>{m.evidence}</span>
                </div>
                <div className={styles.volumeNumbers}>
                  <strong>
                    {m.documentedPieces === null
                      ? "Pending"
                      : `${num(m.documentedPieces)} pieces`}
                  </strong>
                  <span>
                    {num(m.requested)} requested · {m.packages} batches ·{" "}
                    {m.averageRequest === null ? "—" : num(m.averageRequest)} avg
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.chartFoot}>
            Provider pieces use complete confirmed-mail counts when available,
            then invoice pieces, then postal-statement pieces. They are not USPS
            delivery counts. Latest month is partial through {day(d.asOf)}.
          </div>
        </Panel>
      </div>
      <Panel
        title="Which campaign approach is working?"
        detail="Reviewed audience strategy and touch, using current linked outcomes"
        aside={
          <button
            onClick={() => onTab("List performance")}
            className={styles.textButton}
          >
            Open list detail <ArrowRight size={15} />
          </button>
        }
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Audience strategy</th>
                <th>Campaign mix</th>
                <th>Requested</th>
                <th>Linked leads</th>
                <th>Leads / 1,000 requested</th>
                <th>Invoiced revenue</th>
                <th>Revenue / 1,000 requested</th>
                <th>Documented mail cost</th>
                <th>Revenue ROAS</th>
              </tr>
            </thead>
            <tbody>
              {strategyRows.map((row) => (
                <tr key={row.audience}>
                  <td className={styles.listName}>
                    <strong>{row.label}</strong>
                    <small>{num(row.averageRequest)} average requested rows</small>
                  </td>
                  <td>
                    {row.campaigns} campaign{row.campaigns === 1 ? "" : "s"}
                    <small>
                      {row.touches.first_touch} first · {row.touches.resend} resend
                      {row.touches.mixed ? ` · ${row.touches.mixed} mixed` : ""}
                      {row.touches.unclassified
                        ? ` · ${row.touches.unclassified} unclassified`
                        : ""}
                    </small>
                  </td>
                  <td>{num(row.requested)}</td>
                  <td>{num(row.leads)}</td>
                  <td>
                    {row.leadsPerThousandRequested === null
                      ? "—"
                      : row.leadsPerThousandRequested.toFixed(1)}
                  </td>
                  <td>{money(row.invoiced)}</td>
                  <td>{money(row.revenuePerThousandRequested)}</td>
                  <td>
                    {money(row.documentedCost)}
                    <small>
                      {row.costComplete
                        ? "Complete coverage"
                        : `${row.costCoverage} campaigns complete`}
                    </small>
                  </td>
                  <td>
                    {row.roas === null ? "Unavailable" : `${row.roas.toFixed(2)}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.footnote}>
          {strategyCoverage.classified} of {strategyCoverage.total} campaigns have
          both audience and touch reviewed. Leads and revenue use exact prior-list
          address linkage. Per-1,000 figures use requested rows because confirmed
          mailed counts are incomplete; they are comparison signals, not response
          rates or causal proof.
        </div>
      </Panel>
      <Panel
        title="Next in your queue"
        detail="Prioritized from the latest evidence review"
        aside={
          <button
            onClick={() => onTab("Next sends")}
            className={styles.textButton}
          >
            View all <ArrowRight size={15} />
          </button>
        }
      >
        <div className={styles.queue}>
          {d.actions.slice(0, 3).map((a) => (
            <button
              key={a.id}
              className={styles.queueRow}
              onClick={() => onTab("Next sends")}
            >
              <span className={styles.rank}>{a.priority}</span>
              <div>
                <strong>{a.neighborhood}</strong>
                <span>
                  {a.lane} · Review {day(a.due)}
                  {a.install ? ` · Roof ${day(a.install)}` : ""}
                </span>
              </div>
              <Pill tone="amber">{a.status}</Pill>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </Panel>
      <div className={styles.twoCol}>
        <Panel
          title="Promising list signals"
          detail="Linked invoiced outcomes; small samples, not causal proof"
        >
          <div className={styles.miniList}>
            {[...d.campaigns]
              .filter((c) => c.invoiced > 0)
              .sort((a, b) => b.invoiced - a.invoiced)
              .slice(0, 4)
              .map((c) => (
                <div key={c.id}>
                  <span>
                    {c.name}
                    <small>
                      {c.leads} linked lead{c.leads === 1 ? "" : "s"}
                    </small>
                  </span>
                  <strong>{money(c.invoiced)}</strong>
                </div>
              ))}
          </div>
        </Panel>
        <Panel
          title="Before scaling spend"
          detail="Close the gaps that change the decision"
        >
          <div className={styles.checkList}>
            <p>
              <CircleAlert size={17} />
              Reconcile postage and the latest vendor bills.
            </p>
            <p>
              <CircleAlert size={17} />
              Confirm actual drops before calculating response rates.
            </p>
            <p>
              <CircleAlert size={17} />
              Check recent touches and customer suppression.
            </p>
            <p>
              <Check size={17} />
              Preserve archived revenue and exclude test records.
            </p>
          </div>
          <button
            className={styles.textButton}
            onClick={() => onTab("Evidence")}
          >
            Open evidence and cost review <ArrowRight size={15} />
          </button>
        </Panel>
      </div>
    </>
  );
}
function BudgetPlanner({ d }: { d: WeeklyReview }) {
  const [basis, setBasis] = useState("all");
  const [rows, setRows] = useState("1000");
  const [monthlyTarget, setMonthlyTarget] = useState("45000");
  const [largeDrops, setLargeDrops] = useState("2");
  const [largePieces, setLargePieces] = useState("15000");
  const [automatedDrops, setAutomatedDrops] = useState("20");
  const [automatedPieces, setAutomatedPieces] = useState("750");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("priority");
  const pricing = invoicePricing(d.invoices, basis);
  const allInRate = allInProjection(d, basis);
  const parseQuantity = (v: string) =>
    v.trim() === ""
      ? null
      : /^\d+$/.test(v) && Number.isSafeInteger(Number(v))
        ? Number(v)
        : null;
  const quantity = (a: WeeklyAction) =>
    parseQuantity(
      quantities[a.id] ??
        (a.proposedQuantity === null ? "" : String(a.proposedQuantity)),
    );
  const historicalAverage = d.summary.packages
    ? Math.round(d.summary.requested / d.summary.packages)
    : null;
  const mix = campaignMix({
    target: parseQuantity(monthlyTarget),
    largeDrops: parseQuantity(largeDrops),
    largePieces: parseQuantity(largePieces),
    automatedDrops: parseQuantity(automatedDrops),
    automatedPieces: parseQuantity(automatedPieces),
    historicalAverage,
    invoiceRate: pricing.rate,
    allInRate,
  });
  const mailings = d.actions.filter((a) => a.lane !== "Resolve evidence");
  const planned = mailings.filter((a) => quantity(a) !== null);
  const plannedTotal =
    pricing.rate === null
      ? null
      : Math.round(
          planned.reduce(
            (sum, a) => sum + (projectedCost(quantity(a), pricing.rate) ?? 0),
            0,
          ) * 100,
        ) / 100;
  const plannedRows = planned.reduce((sum, a) => sum + (quantity(a) ?? 0), 0);
  const ordered = [...mailings].sort((a, b) =>
    sort === "priority"
      ? a.priority - b.priority
      : quantity(a) === null
        ? 1
        : quantity(b) === null
          ? -1
          : sort === "high"
            ? (quantity(b) ?? 0) - (quantity(a) ?? 0)
            : (quantity(a) ?? 0) - (quantity(b) ?? 0),
  );
  return (
    <>
      <div className={styles.sectionIntro}>
        <div>
          <h2>What will the next mailing cost?</h2>
          <p>
            Projected Ron invoice = planned pieces × average invoiced cost per
            piece.
          </p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <label>
          Cost basis{" "}
          <select value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="all">All invoices · weighted average</option>
            <option value="latest">Latest invoice only</option>
          </select>
        </label>
      </div>
      <div className={styles.stats}>
        <div>
          <span>Invoice-based cost / piece</span>
          <strong>{unitMoney(pricing.rate)}</strong>
          <small>
            {pricing.rate === null
              ? "Quantity evidence needed"
              : `${(pricing.rate * 100).toFixed(2)}¢ per physical piece`}
          </small>
        </div>
        <div>
          <span>Invoice total in this basis</span>
          <strong>{exactMoney(pricing.total)}</strong>
          <small>
            {pricing.invoiceCount} invoice
            {pricing.invoiceCount === 1 ? "" : "s"} · payment date does not
            affect this
          </small>
        </div>
        <div>
          <span>Invoiced pieces</span>
          <strong>{num(pricing.pieces)}</strong>
          <small>Counted once, not once per service line</small>
        </div>
        <div>
          <span>Latest invoice cost / piece</span>
          <strong>
            {unitMoney(invoicePricing(d.invoices, "latest").rate)}
          </strong>
          <small>
            {pricing.latest
              ? `Invoice #${pricing.latest.number} · ${day(pricing.latest.invoiceDate)}`
              : "No invoices found"}
          </small>
        </div>
      </div>
      <Notice>
        This estimates Ron’s bill from actual invoices, including their fees,
        tax and discounts. Additional USPS charges outside those invoices are
        not included. Small lists may cost more per piece because setup fees are
        spread over fewer homes.
      </Notice>
      <Panel
        title="Plan the monthly campaign mix"
        detail="Compare large audience drops with an automated neighborhood program. This scenario stays in your browser and does not create mailings."
      >
        <div className={styles.mixControls}>
          <label>
            Monthly piece target
            <input
              aria-label="Monthly piece target"
              type="number"
              min="0"
              step="1"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
            />
          </label>
          <label>
            Large audience drops
            <input
              aria-label="Large audience drops"
              type="number"
              min="0"
              step="1"
              value={largeDrops}
              onChange={(e) => setLargeDrops(e.target.value)}
            />
          </label>
          <label>
            Pieces per large drop
            <input
              aria-label="Pieces per large audience drop"
              type="number"
              min="0"
              step="1"
              value={largePieces}
              onChange={(e) => setLargePieces(e.target.value)}
            />
          </label>
          <label>
            Automated neighborhood runs
            <input
              aria-label="Automated neighborhood runs"
              type="number"
              min="0"
              step="1"
              value={automatedDrops}
              onChange={(e) => setAutomatedDrops(e.target.value)}
            />
          </label>
          <label>
            Pieces per neighborhood run
            <input
              aria-label="Pieces per automated neighborhood run"
              type="number"
              min="0"
              step="1"
              value={automatedPieces}
              onChange={(e) => setAutomatedPieces(e.target.value)}
            />
          </label>
        </div>
        <div className={styles.mixSummary} aria-live="polite">
          <div>
            <small>Planned monthly volume</small>
            <strong>{mix ? num(mix.pieces) : "Enter valid quantities"}</strong>
            <span>
              {mix
                ? mix.gap === 0
                  ? "Target met"
                  : mix.gap > 0
                    ? `${num(mix.gap)} pieces below target`
                    : `${num(Math.abs(mix.gap))} pieces above target`
                : "Whole numbers only"}
            </span>
          </div>
          <div>
            <small>Campaign workload</small>
            <strong>{mix ? `${mix.campaigns} campaigns` : "—"}</strong>
            <span>
              {!mix ||
              mix.historicalBatches === null ||
              historicalAverage === null
                ? "Historical comparison unavailable"
                : `${mix.historicalBatches} batches at the current ${num(historicalAverage)}-piece average`}
            </span>
          </div>
          <div>
            <small>Projected Ron invoice</small>
            <strong>{exactMoney(mix?.invoiceCost ?? null)}</strong>
            <span>{unitMoney(pricing.rate)} invoice-based per piece</span>
          </div>
          <div>
            <small>Projected total with postage</small>
            <strong>{exactMoney(mix?.allInCost ?? null)}</strong>
            <span>{unitMoney(allInRate)} planning rate per piece</span>
          </div>
        </div>
        <p className={styles.profitNote}>
          The current data does not classify historical campaigns as
          job-scheduled versus general audience, so this compares volume,
          workload and cost only. It does not claim which strategy produces a
          better response or return.
        </p>
      </Panel>
      <Panel
        title="Quick estimate"
        detail="Use any planned piece count. No payment or mailing is created."
      >
        <div className={styles.budgetCalculator}>
          <label>
            Planned pieces
            <input
              aria-label="Planned pieces"
              type="number"
              min="0"
              step="1"
              value={rows}
              onChange={(e) => setRows(e.target.value)}
            />
          </label>
          <span>× {unitMoney(pricing.rate)}</span>
          <div>
            <small>Projected Ron invoice</small>
            <strong aria-live="polite">
              {exactMoney(projectedCost(parseQuantity(rows), pricing.rate))}
            </strong>
          </div>
        </div>
      </Panel>
      <Notice>
        Total budget including postage: <strong>{exactMoney(projectedCost(parseQuantity(rows), allInRate))}</strong> for the quick-estimate quantity ({unitMoney(allInRate)} per piece). This removes stamps from the invoice average, then adds full postage using the latest observed request month’s statements. It is a planning estimate; setup mix, postage rates and reprints can change the actual bill.
      </Notice>
      <Panel
        title="Budget the next-send queue"
        detail="Edit quantities to compare scenarios. These what-if values are local to this tab and do not change the approved mailing plan."
        aside={
          <label className={styles.checkbox}>
            Sort{" "}
            <select
              className={styles.budgetSelect}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="priority">Priority</option>
              <option value="high">Projected cost: high to low</option>
              <option value="low">Projected cost: low to high</option>
            </select>
          </label>
        }
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Mailing / neighborhood</th>
                <th>Status</th>
                <th>Planned pieces</th>
                <th>Projected Ron cost</th>
                <th>Projected total with postage</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.neighborhood}</strong>
                    <small>
                      {a.lane} · review {day(a.due)}
                    </small>
                  </td>
                  <td>
                    <Pill tone={a.status === "Hold" ? "amber" : "blue"}>
                      {a.status}
                    </Pill>
                  </td>
                  <td>
                    <input
                      className={styles.budgetInput}
                      aria-label={`Planned pieces for ${a.neighborhood}`}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Enter pieces"
                      value={
                        quantities[a.id] ??
                        (a.proposedQuantity === null
                          ? ""
                          : String(a.proposedQuantity))
                      }
                      onChange={(e) =>
                        setQuantities({ ...quantities, [a.id]: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    {quantity(a) === null
                      ? "Enter quantity"
                      : exactMoney(projectedCost(quantity(a), pricing.rate))}
                  </td>
                  <td>{exactMoney(projectedCost(quantity(a), allInRate))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.footnote}>
          <strong>
            {num(plannedRows)} pieces → {exactMoney(plannedTotal)} projected Ron
            cost
          </strong>{" "}
          across {planned.length} of {mailings.length} mailing opportunities
          with entered quantities. Holds remain on hold; this total is not
          authorization to send.
        </div>
      </Panel>
      <Panel
        title="Invoices behind the average"
        detail="Weighted average = sum of invoice amounts ÷ sum of their physical pieces, never an average of the individual rates."
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Service month</th>
                <th>Invoice amount</th>
                <th>Pieces</th>
                <th>Cost / piece</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {d.invoices.map((i) => (
                <tr key={i.number}>
                  <td>#{i.number}</td>
                  <td>{monthLabel(i.serviceMonth)}</td>
                  <td>{exactMoney(i.amount)}</td>
                  <td>{num(i.pieces)}</td>
                  <td>
                    {unitMoney(i.pieces > 0 ? i.amount / i.pieces : null)}
                  </td>
                  <td>
                    <a
                      href={i.invoiceEvidence}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Invoice <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Monthly({ d, reviewId }: { d: WeeklyReview; reviewId: string }) {
  const [showPayments, setShowPayments] = useState(false);
  const [selected, setSelected] = useState("all");
  const rows = d.months.filter(
    (m) => selected === "all" || m.month === selected,
  );
  return (
    <>
      <div className={styles.toolbar}>
        <label>
          Period{" "}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">All observed months</option>
            {d.months.map((m) => (
              <option key={m.month} value={m.month}>
                {monthLabel(m.month)}
              </option>
            ))}
          </select>
        </label>
        <a
          className={styles.secondary}
          href={exportUrl(reviewId, "monthly", { month: selected })}
        >
          <ArrowDownToLine size={15} />
          Export monthly CSV
        </a>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={showPayments}
            onChange={(e) => setShowPayments(e.target.checked)}
          />
          Show payment timing
        </label>
      </div>
      <Notice>
        Ron’s invoices count as committed costs when received, regardless of
        payment timing. They are grouped below by service month. Customer
        revenue follows lead creation month, so these columns are not matching
        campaign groups for ROI.
      </Notice>
      <Panel
        title="Monthly performance"
        detail="Unknown cost is left unknown; it is never treated as zero."
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                {[
                  "Month",
                  "Requested",
                  "New leads",
                  "Approved invoices¹",
                  "Ron invoices²",
                  "Invoiced pieces",
                  "Cost / piece²",
                  ...(showPayments ? ["Payments recorded"] : []),

                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.month}>
                  <td>
                    <strong>{monthLabel(m.month)}</strong>
                    {m.month === d.asOf.slice(0, 7) && (
                      <small>Month to date</small>
                    )}
                  </td>
                  <td>{num(m.requested)}</td>
                  <td>{m.leads}</td>
                  <td>{exactMoney(m.invoiced)}</td>
                  <td>
                    {m.vendorCost === null
                      ? "No invoice found"
                      : exactMoney(m.vendorCost)}
                  </td>
                  <td>
                    {invoicePricing(
                      d.invoices.filter((i) => i.serviceMonth === m.month),
                    ).pieces
                      ? num(
                          invoicePricing(
                            d.invoices.filter(
                              (i) => i.serviceMonth === m.month,
                            ),
                          ).pieces,
                        )
                      : "—"}
                  </td>
                  <td>
                    {unitMoney(
                      invoicePricing(
                        d.invoices.filter((i) => i.serviceMonth === m.month),
                      ).rate,
                    )}
                  </td>
                  {showPayments && (
                    <td>
                      {m.paid === null
                        ? "No payment recorded"
                        : exactMoney(m.paid)}
                    </td>
                  )}

                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.footnote}>
          ¹ Approved invoices on Direct Mail jobs, grouped by lead month; not
          collected cash. ² Actual invoice totals, not a 50–60¢ assumption.
          Additional USPS charges may be separate. “No payment recorded” means
          no payment evidence found in that month, not an unpaid invoice. July’s
          bill was paid in August. Observed history begins{" "}
          {monthLabel(d.months[0].month)}.
        </div>
      </Panel>
      <MailReturns d={d} reviewId={reviewId} />
      <JobProfit d={d} reviewId={reviewId} monthlyOnly />
    </>
  );
}
function Lists({ d, reviewId }: { d: WeeklyReview; reviewId: string }) {
  const profit = useJobProfits(reviewId);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("leads");
  const [filter, setFilter] = useState("all");
  const rows = d.campaigns
    .filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "revenue"
            ? c.invoiced > 0
            : filter === "response"
              ? c.leads > 0
              : c.reviewDate <= d.asOf)),
    )
    .sort((a, b) =>
      sort === "leads"
        ? b.leads - a.leads || b.invoiced - a.invoiced
        : sort === "revenue"
          ? b.invoiced - a.invoiced
          : sort === "oldest"
            ? a.requestedDate.localeCompare(b.requestedDate)
            : b.requestedDate.localeCompare(a.requestedDate),
    );
  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            aria-label="Search mailing lists"
            placeholder="Find a neighborhood or list…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All lists</option>
            <option value="revenue">Invoiced outcome</option>
            <option value="response">Any linked lead</option>
            <option value="due">Past provisional review</option>
          </select>
        </label>
        <label>
          Sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="leads">Most leads</option>
            <option value="revenue">Most invoiced</option>
            <option value="oldest">Oldest request</option>
            <option value="newest">Newest request</option>
          </select>
        </label>
      </div>
      <Notice>
        {d.summary.linkedLeads} of {d.summary.leads} channel-confirmed leads
        link to one earlier list by address. Multi-list matches remain
        unassigned. Requested rows are not a confirmed-mailed denominator.
      </Notice>
      <Panel
        title={`${rows.length} mailing lists / packages`}
        detail="Review dates are provisional. Always check the latest address-level touches before resending."
        aside={
          <a
            className={styles.secondary}
            href={exportUrl(reviewId, "lists", { q: search, sort, filter })}
          >
            <ArrowDownToLine size={15} />
            Export
          </a>
        }
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                {[
                  "List / package",
                  "Strategy / touch",
                  "Requested",
                  "Rows",
                  "Linked leads",
                  "Invoiced revenue",
                  "Review date",
                  "Later touches",
                  "Evidence",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td className={styles.listName}>
                      <strong>{c.name}</strong>
                      <small>
                        {c.invoiced > 0
                          ? "Promising revenue signal"
                          : c.leads > 0
                            ? "Response signal; watch outcomes"
                            : "No linked outcome yet; assess maturity"}
                      </small>
                    </td>
                    <td>
                      {audienceLabels[c.audienceStrategy ?? "unclassified"]}
                      <small>{touchLabels[c.touchType ?? "unclassified"]}</small>
                    </td>
                    <td>
                      {day(c.requestedDate)}
                      <small>Planned {day(c.plannedDate)}</small>
                    </td>
                    <td>{num(c.requested)}</td>
                    <td>{c.leads}</td>
                    <td
                      className={c.invoiced > 0 ? styles.greenText : undefined}
                    >
                      {money(c.invoiced)}
                    </td>
                    <td>
                      {day(c.reviewDate)}
                      <small>{c.reviewBasis}</small>
                    </td>
                    <td>
                      {num(c.laterTouches)}
                      <small>Addresses</small>
                    </td>
                    <td>
                      <a
                        href={c.evidence}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open sent email for ${c.name}`}
                      >
                        Sent email <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={9}>
                      {profit.data ? (
                        <CampaignJobProfit
                          d={d}
                          jobs={profit.data.jobs}
                          campaignId={c.id}
                        />
                      ) : (
                        <small>
                          {profit.isError
                            ? "Job profit unavailable; use Job profit to retry."
                            : "Loading linked jobs…"}
                        </small>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className={styles.empty}>
              No lists match. Try a different search or filter.
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
function Roofs({ d }: { d: WeeklyReview }) {
  const [only, setOnly] = useState(true);
  const rows = d.roofs.filter((r) => !only || r.scheduled);
  return (
    <>
      <Notice>
        Schedules are verified as of {day(d.asOf)}. Confirm production readiness
        and mail arrival timing before using “we’re roofing nearby.” A
        roof-specific hail report does not establish hail at every recipient.
      </Notice>
      <Panel
        title="Upcoming roof opportunities"
        detail="Combine verified location, installation timing, prior mail and the exact storm footprint."
        aside={
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={only}
              onChange={(e) => setOnly(e.target.checked)}
            />
            Scheduled only
          </label>
        }
      >
        <div className={styles.roofGrid}>
          {rows.map((r, i) => (
            <article key={`${r.date}-${i}`} className={styles.roof}>
              <div className={styles.roofDate}>
                <CalendarDays size={17} />
                {day(r.date)}
                <Pill tone={r.scheduled ? "blue" : "amber"}>{r.status}</Pill>
              </div>
              <h3>{r.neighborhood}</h3>
              <p>
                <strong>Prior lists</strong>
                {r.priorLists.join(" · ") || "No exact prior-list match"}
              </p>
              <p>
                <strong>Hail at the roof</strong>
                {r.hail.length
                  ? r.hail
                      .map(
                        (h) =>
                          `${day(h.date)}, ${h.date.slice(0, 4)} · ${h.inches}″`,
                      )
                      .join("; ")
                  : "No ≥1-inch roof-specific report in this snapshot"}
              </p>
              <div className={styles.roofGate}>
                {r.scheduled
                  ? "Next: verify recipients, storm footprint and arrival window."
                  : "Hold: this status does not confirm an installation."}
              </div>
            </article>
          ))}
        </div>
        {!rows.length && (
          <div className={styles.empty}>No scheduled roofs in this review.</div>
        )}
      </Panel>
    </>
  );
}
function Audience({ d }: { d: WeeklyReview }) {
  return (
    <>
      <Notice>
        These are selected-list property samples, not complete neighborhood
        demographics. Living area is not roof area, and larger homes have not
        yet been shown to produce better margins.
      </Notice>
      <Panel
        title="Neighborhood property profiles"
        detail="Use property fit alongside response quality, costs and production capacity."
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                {[
                  "Neighborhood",
                  "Properties",
                  "Known home sizes",
                  "Median living area",
                  "Build year coverage",
                  "Value coverage",
                  "Occupancy coverage",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...d.profiles]
                .sort((a, b) => b.properties - a.properties)
                .map((p) => (
                  <tr key={p.neighborhood}>
                    <td>
                      <strong>{p.neighborhood}</strong>
                    </td>
                    <td>{num(p.properties)}</td>
                    <td>{num(p.knownSizes)}</td>
                    <td>
                      {p.medianSize === null
                        ? "Unknown"
                        : `${num(p.medianSize)} sqft`}
                    </td>
                    <td>
                      {p.knownYears}/{p.properties}
                    </td>
                    <td>
                      {p.knownValues}/{p.properties}
                    </td>
                    <td>
                      {p.knownOccupancy}/{p.properties}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title="Demographic enrichment still needed"
        detail="Area context must not be mistaken for household facts."
      >
        <div className={styles.checkList}>
          <p>
            Owner occupancy, construction year and assessed-value bands need
            source-backed enrichment.
          </p>
          <p>
            Census income and tenure estimates need dataset vintage, geography
            and margins of error.
          </p>
          <p>
            Compare results by property band only after recipients, responses,
            revenue and costs are linked.
          </p>
        </div>
      </Panel>
    </>
  );
}
function Evidence({
  d,
  publishedAt,
  id,
}: {
  d: WeeklyReview;
  publishedAt: string;
  id: string;
}) {
  return (
    <>
      <Panel
        title="What is verified — and what remains open"
        detail="Missing evidence stays visible so it cannot masquerade as a zero or a proven result."
      >
        <div className={styles.gapList}>
          {d.gaps.map((g, i) => (
            <div key={g}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{g}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Ron invoices"
        detail="Counted as committed when received. Payment timing is tracked separately; additional USPS charges may be outside these bills."
      >
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                {[
                  "Invoice",
                  "Service month",
                  "Paid",
                  "Amount",
                  "Billed pieces",
                  "Scope",
                  "Sources",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.invoices.map((i) => (
                <tr key={i.number}>
                  <td>#{i.number}</td>
                  <td>{monthLabel(i.serviceMonth)}</td>
                  <td>{i.paidDate ? day(i.paidDate) : "Not recorded"}</td>
                  <td>{exactMoney(i.amount)}</td>
                  <td>{num(i.pieces)}</td>
                  <td className={styles.scope}>{i.scope}</td>
                  <td>
                    <a
                      href={i.invoiceEvidence}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Invoice <ExternalLink size={12} />
                    </a>
                    {i.paymentEvidence ? (
                      <a
                        href={i.paymentEvidence}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Payment <ExternalLink size={12} />
                      </a>
                    ) : (
                      <small>No payment recorded</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <details className={styles.provenance}>
        <summary>Review provenance and refresh behavior</summary>
        <p>
          Evidence reviewed through {d.asOf}; published{" "}
          {new Date(publishedAt).toLocaleString("en-US", {
            timeZone: "America/Chicago",
          })}{" "}
          Chicago time. Results publish on weekdays at 8 a.m. and 2 p.m. The
          page loads the latest publication automatically, checks again every
          five minutes while open, and also checks when the browser reconnects
          or regains focus. “Check for updates” is only a manual retry; it does
          not send mail or rerun source collection.
        </p>
        <p>
          Review ID: <code>{id}</code>
        </p>
        <p>
          Local evidence manifest SHA256: <code>{d.sourceHash}</code>
        </p>
        <p>
          Only aggregate analysis is published. Source-email links require
          access to the connected Gmail account.
        </p>
      </details>
    </>
  );
}
export default function DirectMailPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<Tab>("Overview");
  const [lane, setLane] = useState("All");
  const [actionSort, setActionSort] = useState("priority");
  const q = useQuery<{
    available: true;
    id: string;
    publishedAt: string;
    stale: boolean;
    fallback?: boolean;
    warning?: string;
    data: WeeklyReview;
  }>({
    queryKey: ["direct-mail-weekly"],
    queryFn: async () => {
      const r = await fetch("/api/direct-mail/weekly", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok || !body.available)
        throw new Error(body.message || "Unable to load review");
      return body;
    },
    staleTime: 5 * 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
  });
  const d = q.data?.data;
  const profit = useJobProfits(q.data?.id);
  const currentProfit = profit.data ? profitTotals(profit.data.jobs) : null;
  const currentMailCost = d ? mailingCosts(d) : null;
  const currentRevenue = currentProfit?.revenue ?? null;
  const currentGrossProfit = currentProfit?.grossProfit ?? null;
  const documentedMailCost = currentMailCost?.known ?? null;
  const currentReturns = returnMetrics(
    currentRevenue,
    currentGrossProfit,
    documentedMailCost,
  );
  const currentGrossProfitPerDollar = grossProfitPerDollar(
    currentGrossProfit,
    documentedMailCost,
  );
  const currentCash = d ? cashTotals(d) : { applied: null, unapplied: null };
  const currentCashPerDollar = perDollarReturn(
    currentCash.applied,
    documentedMailCost,
  );
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <Mail size={14} />
            Maverick growth / Direct mail
          </div>
          <h1>Your next mailing starts here.</h1>
          <p>
            Results, repeat touches and neighborhood opportunities — in one
            place.
          </p>
        </div>
        <button
          className={styles.secondary}
          onClick={() => {
            q.refetch();
            queryClient.invalidateQueries({
              queryKey: ["direct-mail-job-profit"],
            });
          }}
          disabled={q.isFetching}
        >
          <RefreshCw
            size={15}
            className={q.isFetching ? styles.spin : undefined}
          />
          {q.isFetching ? "Checking…" : "Check for updates"}
        </button>
      </header>
      <div className={styles.freshness}>
        <span>
          <span
            className={`${styles.dot} ${q.data?.stale ? styles.oldDot : ""}`}
          />
          {d
            ? `Evidence through ${monthLabel(d.asOf.slice(0, 7)).split(" ")[0]} ${Number(d.asOf.slice(8))}, ${d.asOf.slice(0, 4)}`
            : "Loading latest review…"}
        </span>
        <span>Updates weekdays · 8 a.m. &amp; 2 p.m. Chicago</span>
        {q.data?.publishedAt && (
          <span>
            Published{" "}
            {new Date(q.data.publishedAt).toLocaleString("en-US", {
              timeZone: "America/Chicago",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            CT
          </span>
        )}
        <Pill tone="muted">Mailing approval required</Pill>
      </div>
      {q.data?.stale && (
        <Notice>
          This review is over seven days old. Refresh the source evidence and
          publish a new review before relying on schedules or resend timing.
        </Notice>
      )}
      {q.isError && (
        <Notice>
          {q.error.message}{" "}
          {d
            ? "The last loaded review remains visible; it has not refreshed."
            : "The page will retry automatically. The independent mailing-proof view is shown below."}
        </Notice>
      )}
      {q.data?.fallback && <Notice>{q.data.warning}</Notice>}
      {d && (
        <div className={styles.stats}>
          <div>
            <span>Direct Mail leads</span>
            <strong>{num(d.summary.leads)}</strong>
            <small>
              <b>+{d.summary.newLeads}</b> in the last 7 days ·{" "}
              {d.summary.archived} archived included
            </small>
          </div>
          <div>
            <span>Rows requested</span>
            <strong>{num(d.summary.requested)}</strong>
            <small>
              {d.summary.packages} reconciled packages · delivery{" "}
              {d.summary.confirmedMailed === null
                ? "unconfirmed"
                : num(d.summary.confirmedMailed)}
            </small>
          </div>
          <div>
            <span>Approved invoices</span>
            <strong>{money(d.summary.invoiced)}</strong>
            <small>
              On Direct Mail jobs · {money(d.summary.balance)} balance
            </small>
          </div>
          <div>
            <span>Ron invoices · committed</span>
            <strong>{money(invoicePricing(d.invoices).total)}</strong>
            <small className={styles.amberText}>
              {unitMoney(invoicePricing(d.invoices).rate)} / piece ·
              invoice-based
            </small>
          </div>
          <div>
            <span>Revenue ROAS</span>
            <strong>
              {profit.isPending
                ? "Loading…"
                : currentReturns.roas === null
                  ? "Unavailable"
                  : `${currentReturns.roas.toFixed(2)}×`}
            </strong>
            <small>
              {currentRevenue === null || documentedMailCost === null
                ? "Needs current revenue and mailing cost"
                : `${money(currentRevenue)} invoiced ÷ ${money(documentedMailCost)} documented mailing cost`}
            </small>
            <small className={styles.amberText}>
              {profit.isError
                ? "Current job-profit read failed"
                : currentMailCost?.complete
                  ? "Documented vendor and postage coverage complete"
                  : `Provisional · ${currentMailCost?.covered ?? 0} of ${currentMailCost?.count ?? d.campaigns.length} lists have complete cost coverage`}
            </small>
          </div>
          <div>
            <span>Gross profit per $1 of mail spend</span>
            <strong>
              {profit.isPending
                ? "Loading…"
                : currentGrossProfitPerDollar === null
                  ? "Unavailable"
                  : `$${currentGrossProfitPerDollar.toFixed(2)}`}
            </strong>
            <small>
              {currentGrossProfit === null || documentedMailCost === null
                ? "Needs current gross profit and mailing cost"
                : `${money(currentGrossProfit)} gross profit ÷ ${money(documentedMailCost)} documented mailing cost`}
            </small>
            <small className={styles.amberText}>
              {profit.isError
                ? "Current job-profit read failed"
                : currentProfit
                  ? `Provisional · ${currentProfit.reconciledJobs} reconciled, ${currentProfit.provisionalJobs} provisional`
                  : "Loading cost accuracy"}
            </small>
          </div>
          <div>
            <span>Applied customer cash</span>
            <strong>{money(currentCash.applied)}</strong>
            <small>
              {currentCash.unapplied === null
                ? "Reviewed payment snapshot unavailable"
                : `${money(currentCash.unapplied)} unapplied · kept separate`}
            </small>
            <small className={styles.amberText}>
              {d.cashReview
                ? `Reviewed ${new Date(d.cashReview.verifiedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })} · bank settlement unverified`
                : "Needs a reviewed customer-cash snapshot"}
            </small>
          </div>
          <div>
            <span>Applied cash per $1 of mail spend</span>
            <strong>
              {currentCashPerDollar === null
                ? "Unavailable"
                : `$${currentCashPerDollar.toFixed(2)}`}
            </strong>
            <small>
              {currentCash.applied === null || documentedMailCost === null
                ? "Needs reviewed applied cash and mailing cost"
                : `${money(currentCash.applied)} applied ÷ ${money(documentedMailCost)} documented mailing cost`}
            </small>
            <small className={styles.amberText}>
              Provisional · cash timing differs from mailing timing
            </small>
          </div>
        </div>
      )}
      <nav className={styles.tabs} aria-label="Direct Mail sections">
        {tabs.map((t) => (
          <button
            key={t}
            aria-current={active === t ? "page" : undefined}
            className={active === t ? styles.selected : ""}
            onClick={() => setActive(t)}
          >
            {t}
            {t === "Next sends" && d && <span>{d.actions.length}</span>}
          </button>
        ))}
      </nav>
      {!d && !q.isError && active !== "Mailing proof" && (
        <div className={styles.loading} role="status">
          <RefreshCw size={20} className={styles.spin} />
          Loading the latest reviewed results…
        </div>
      )}
      {!d && q.isError && active !== "Mailing proof" && (
        <div className={styles.content}>
          <MailingProof />
        </div>
      )}
      {active === "Mailing proof" ? (
        <div className={styles.content}>
          <Notice>
            This tab reads the operational mailing-proof records separately from
            the weekly review. Missing entries do not mean no mail was requested
            or money spent; the reviewed email history is in the other tabs.
          </Notice>
          <MailingProof />
        </div>
      ) : d ? (
        <div className={styles.content}>
          {active === "Overview" && <Overview d={d} onTab={setActive} />}
          {active === "Next sends" && (
            <>
              <div className={styles.sectionIntro}>
                <div>
                  <h2>Prepare the next week.</h2>
                  <p>
                    Ranked actions, clear owners and the checks that still need
                    to happen.
                  </p>
                </div>
                <a
                  className={styles.secondary}
                  href={exportUrl(q.data!.id, "actions", { lane })}
                >
                  <ArrowDownToLine size={15} />
                  Export action plan
                </a>
              </div>
              <div className={styles.toolbar}>
                <label>
                  Focus{" "}
                  <select
                    value={lane}
                    onChange={(e) => setLane(e.target.value)}
                  >
                    {[
                      "All",
                      "Resend",
                      "Upcoming roof",
                      "New area",
                      "Resolve evidence",
                    ].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Sort{" "}
                  <select
                    value={actionSort}
                    onChange={(e) => setActionSort(e.target.value)}
                  >
                    <option value="priority">Priority</option>
                    <option value="cost-high">
                      Projected cost: high to low
                    </option>
                    <option value="cost-low">
                      Projected cost: low to high
                    </option>
                  </select>
                </label>
                <span className={styles.caption}>
                  Proposed quantities are ceilings before suppression. Budget:{" "}
                  {d.summary.budget === null
                    ? "unset"
                    : money(d.summary.budget)}
                  .
                </span>
              </div>
              <div className={styles.actions}>
                {d.actions
                  .filter((a) => lane === "All" || a.lane === lane)
                  .sort((a, b) =>
                    actionSort === "priority"
                      ? a.priority - b.priority
                      : a.proposedQuantity === null
                        ? 1
                        : b.proposedQuantity === null
                          ? -1
                          : actionSort === "cost-high"
                            ? b.proposedQuantity - a.proposedQuantity
                            : a.proposedQuantity - b.proposedQuantity,
                  )
                  .map((a) => (
                    <ActionCard
                      key={a.id}
                      a={a}
                      asOf={d.asOf}
                      rate={invoicePricing(d.invoices).rate}
                    />
                  ))}
              </div>
            </>
          )}
          {active === "Budget planner" && <BudgetPlanner d={d} />}
          {active === "Mailing costs" && <MailingCosts d={d} reviewId={q.data!.id} />}
          {active === "Monthly results" && (
            <Monthly d={d} reviewId={q.data!.id} />
          )}
          {active === "Job profit" && <JobProfit d={d} reviewId={q.data!.id} />}
          {active === "List performance" && (
            <Lists d={d} reviewId={q.data!.id} />
          )}
          {active === "Roof opportunities" && <Roofs d={d} />}
          {active === "Audience" && <Audience d={d} />}
          {active === "Evidence" && (
            <Evidence d={d} id={q.data!.id} publishedAt={q.data!.publishedAt} />
          )}
        </div>
      ) : null}
      {active === "Neighborhoods & signs" && <NeighborhoodOpportunities review={d?.neighborhoodReview} />}
      <footer className={styles.footer}>
        Reviewed evidence, not mailing authorization. No messages, payments or
        CRM changes are made from this page.
      </footer>
    </div>
  );
}
