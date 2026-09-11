"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WeeklyReview } from "@/lib/direct-mail/weekly";
import {
  campaignProfit,
  profitTotals,
  roundMoney,
  type JobProfit,
  type ProfitResponse,
} from "@/lib/direct-mail/profit";
import { mailingCosts, returnMetrics } from "@/lib/direct-mail/costs";
import styles from "@/app/direct-mail/weekly.module.css";
const money = (n: number | null) =>
  n === null
    ? "Unknown"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const monthName = (s: string) =>
  new Date(s + "-01T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export function useJobProfits(reviewId: string) {
  return useQuery<ProfitResponse>({
    queryKey: ["direct-mail-job-profit", reviewId],
    queryFn: async () => {
      const r = await fetch(
        "/api/direct-mail/profit?id=" + encodeURIComponent(reviewId),
        { cache: "no-store" },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "Job profit unavailable");
      return body;
    },
    staleTime: 60000,
    retry: 1,
  });
}
export function JobProfitTable({ jobs }: { jobs: JobProfit[] }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            {[
              "Job",
              "Invoiced revenue",
              "Applied collections",
              "Recorded job costs",
              "Gross profit to date",
              "Margin",
              "Cost accuracy",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.jobId}>
              <td className={styles.listName}>
                <a
                  href={"https://app.jobnimbus.com/job/" + j.jobId}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>
                    #{j.number} · {j.name}
                  </strong>
                </a>
                <small>{j.status}</small>
                <small>
                  {j.campaignId
                    ? "One earlier list matched"
                    : j.linkage === "multiple_prior_lists_review"
                      ? "Multiple lists: attribution needs review"
                      : "Direct Mail channel; list unassigned"}
                </small>
              </td>
              <td>{money(j.revenue)}</td>
              <td>{money(j.collected)}{(j.unapplied ?? 0) > 0 && <small>{money(j.unapplied)} unapplied</small>}</td>
              <td>
                {money(j.knownCost)}
                <details>
                  <summary>Cost breakdown</summary>
                  <small>Materials {money(j.materials)}</small>
                  <small>Finalized labor {money(j.labor)}</small>
                  <small>Subcontractors {money(j.subcontractors)}</small>
                  <small>Retail {money(j.retail)}</small>
                  <small>Permits {money(j.permits)}</small>
                </details>
              </td>
              <td>
                <strong>{money(j.grossProfit)}</strong>
                <small>
                  {j.state === "Reconciled"
                    ? "Reconciled"
                    : j.state === "No invoiced revenue"
                      ? "No invoiced revenue"
                      : "Provisional"}
                </small>
              </td>
              <td>{j.margin === null ? "—" : j.margin + "%"}</td>
              <td className={styles.listName}>
                <strong>{j.state}</strong>
                <small>{j.closeoutStage}</small>
                {j.state !== "No invoiced revenue" &&
                  j.blockers.map((b) => <small key={b}>{b}</small>)}
                {j.state === "Reconciled" && (
                  <small>Current invoice and cost checks passed</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!jobs.length && (
        <p className={styles.empty}>No jobs in this selection.</p>
      )}
    </div>
  );
}
export function CampaignJobProfit({
  d,
  jobs,
  campaignId,
}: {
  d: WeeklyReview;
  jobs: JobProfit[];
  campaignId: string;
}) {
  const p = campaignProfit(d, jobs, campaignId);
  return (
    <details className={styles.profitDetails}>
      <summary>
        View {p.jobs} linked jobs · {p.invoicedJobs} invoiced ·{" "}
        {money(p.grossProfit)} GP to date
      </summary>
      <div className={styles.profitInset}>
        <div className={styles.profitMetrics}>
          <div>
            <small>Job gross profit to date</small>
            <strong>{money(p.grossProfit)}</strong>
            <small>
              {p.provisionalJobs} provisional · {p.reconciledJobs} reconciled
            </small>
          </div>
          <div>
            <small>{p.reviewedCost ? "Documented mailing cost" : "Estimated Ron mailing cost"}</small>
            <strong>{money(p.mailCost)}</strong>
            <small>{p.reviewedCost?.label ?? "Requested rows × invoice average"}</small>
          </div>
          <div>
            <small>GP less mailing cost</small>
            <strong>{money(p.estimatedContribution)}</strong>
            <small>Provisional contribution · {p.reviewedCost?.complete ? "vendor + postage covered" : "mailing costs may be incomplete"}</small>
          </div>
        </div>
        <p className={styles.profitNote}>
          {p.allocation?.note ?? "Mailing cost is estimated from the invoice average."}{" "}
          Address linkage is a response signal, not proof that this specific
          mailing caused the sale. Gross profit deducts recorded job costs;
          mailing cost is deducted once at the list level.
        </p>
        {p.allocation?.gaps.map(g => <p key={g} className={styles.profitNote}>{g}</p>)}
        <JobProfitTable jobs={p.linked} />
      </div>
    </details>
  );
}
function exportJobs(jobs: JobProfit[], d: WeeklyReview) {
  const rows: unknown[][] = [
    [
      "Job number",
      "Job",
      "Status",
      "List",
      "Lead month",
      "Completion first observed month",
      "Invoiced revenue",
      "Applied collections",
      "Unapplied receipts",
      "Recorded job costs",
      "Gross profit to date",
      "Reconciled gross profit",
      "Margin percent",
      "Accuracy",
      "Outstanding cost checks",
      "Ledger job updated at",
      "JobNimbus link",
    ],
    ...jobs.map((j) => [
      j.number,
      j.name,
      j.status,
      d.campaigns.find((c) => c.id === j.campaignId)?.name ?? "Unassigned",
      j.leadMonth,
      j.completionMonth,
      j.revenue,
      j.collected,
      j.unapplied,
      j.knownCost,
      j.grossProfit,
      j.finalProfit,
      j.margin,
      j.state,
      j.blockers.join("; "),
      j.updatedAt,
      "https://app.jobnimbus.com/job/" + j.jobId,
    ]),
  ];
  const csv = rows
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            (typeof v === "number"
              ? String(v)
              : String(v ?? "Unknown").replace(/^[=+@\-]/, "'$&")
            ).replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "direct-mail-job-profit-" + d.asOf + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
export default function JobProfit({
  d,
  reviewId,
  monthlyOnly = false,
}: {
  d: WeeklyReview;
  reviewId: string;
  monthlyOnly?: boolean;
}) {
  const q = useJobProfits(reviewId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [basis, setBasis] = useState("completion");
  const [selectedMonth, setSelectedMonth] = useState("all");
  if (q.isPending)
    return (
      <section className={styles.panel}>
        <h2>Job profit</h2>
        <p>Loading current job costs…</p>
      </section>
    );
  if (q.isError || !q.data)
    return (
      <section className={styles.panel}>
        <h2>Job profit unavailable</h2>
        <p>{q.error?.message}</p>
        <button className={styles.secondary} onClick={() => q.refetch()}>
          Retry job costs
        </button>
      </section>
    );
  const jobs = q.data.jobs,
    totals = profitTotals(jobs),
    mail = mailingCosts(d);
  const campaignMonth = new Map(
    d.campaigns.map((c) => [c.id, c.requestedDate.slice(0, 7)]),
  );
  const groupMonth = (j: JobProfit) =>
    basis === "completion"
      ? j.completionMonth
      : basis === "mailing"
        ? j.campaignId
          ? campaignMonth.get(j.campaignId)
          : null
        : j.leadMonth;
  const months = [
    ...new Set([
      ...d.months.map((m) => m.month),
      ...jobs.map(groupMonth).filter((v): v is string => !!v),
    ]),
  ].sort();
  const visible = jobs
    .filter(
      (j) =>
        (filter === "all" ||
          (filter === "invoiced" && (j.revenue ?? 0) > 0) ||
          (filter === "provisional" && j.state === "Provisional") ||
          (filter === "reconciled" && j.state === "Reconciled")) &&
        (j.name + " " + j.number)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (selectedMonth === "all" || groupMonth(j) === selectedMonth),
    )
    .sort((a, b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity));
  return (
    <>
      {!monthlyOnly && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Revenue is the start. Profit is what remains.</h2>
              <p>
                Current cost ledger for {totals.jobs} reviewed Direct Mail jobs,
                including archived outcomes.
              </p>
            </div>
            <button
              className={styles.secondary}
              onClick={() => q.refetch()}
              disabled={q.isFetching}
            >
              Refresh job costs
            </button>
          </div>
          <div className={styles.profitMetrics}>
            <div>
              <small>Invoiced revenue</small>
              <strong>{money(totals.revenue)}</strong>
              <small>{totals.invoicedJobs} revenue-producing jobs</small>
            </div>
            <div>
              <small>Gross profit to date</small>
              <strong>{money(totals.grossProfit)}</strong>
              <small>
                After {money(totals.knownCost)} recorded job costs · provisional
              </small>
            </div>
            <div>
              <small>GP less documented mailing costs</small>
              <strong>
                {money(
                  totals.grossProfit === null || mail.known === null
                    ? null
                    : roundMoney(totals.grossProfit - mail.known),
                )}
              </strong>
              <small>
                Less {money(mail.known)} · missing expenses excluded
              </small>
            </div>
            <div>
              <small>Reconciled job gross profit</small>
              <strong>
                {totals.reconciledJobs
                  ? money(totals.finalProfit)
                  : "Not ready"}
              </strong>
              <small>
                {totals.reconciledJobs} reconciled · {totals.provisionalJobs}{" "}
                provisional · {totals.unavailableJobs} unavailable
              </small>
            </div>
          </div>
          <p className={styles.profitNote}>
            Gross profit = invoiced revenue − recorded materials, finalized
            labor, subcontractors, retail and permit costs. Unfinalized costs
            can overstate profit. Job Close Out starts the review. Reconciled requires
            closeout status, paid/final invoices and complete cost checks, including
            any reviewed adjustment holds. New costs or blockers reopen the review;
            figures are not permanently frozen. This is not net company profit. Read{" "}
            {new Date(q.data.fetchedAt).toLocaleString("en-US", {
              timeZone: "America/Chicago",
            })}{" "}
            Chicago from the synced cost ledger.
          </p>
        </section>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Monthly job profit</h2>
            <p>Separate when jobs finish from when the mailing went out.</p>
          </div>
          <label>
            Group profit by{" "}
            <select
              aria-label="Group profit by"
              value={basis}
              onChange={(e) => {
                setBasis(e.target.value);
                setSelectedMonth("all");
              }}
            >
              <option value="completion">Completion first observed</option>
              <option value="mailing">Mailing request month</option>
              <option value="lead">Lead creation month</option>
            </select>
          </label>
        </div>
        <p className={styles.profitNote}>
          {basis === "completion"
            ? "Completion month is the first recorded completed/closeout stage in status history. It is an observed milestone, not a verified accounting recognition date. Values show current lifetime job profit, not profit booked that month."
            : basis === "mailing"
              ? "Jobs are grouped by their single matched mailing request month. Multi-list and unassigned jobs stay out of this comparison. Costs use reviewed invoice allocations and recovered postage. Missing expenses can overstate cohort returns; these are current lifetime outcomes of those mailings."
              : "Revenue and current lifetime job profit follow the lead creation month. Ron invoices follow service month; these are different groups and are not subtracted."}{" "}
          {jobs.filter((j) => !groupMonth(j)).length} jobs have no month in this
          grouping.
        </p>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                {[
                  "Month",
                  "Invoiced jobs",
                  "Invoiced revenue",
                  "GP to date",
                  "Reconciled GP",
                  basis === "mailing"
                    ? "Documented mailing cost"
                    : "Ron invoices · service month",
                  basis === "mailing"
                    ? "GP less mailing cost"
                    : "Cost readiness",
                  ...(basis === "mailing" ? ["Revenue / cost", "Profit ROI to date"] : []),
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const t = profitTotals(jobs.filter((j) => groupMonth(j) === m));
                const costGroup = mailingCosts(d, d.campaigns.filter(c => c.requestedDate.startsWith(m)).map(c => c.id));
                const mailCost =
                  basis === "mailing"
                    ? costGroup.known
                    : (d.months.find((x) => x.month === m)?.vendorCost ?? null);
                const returns = returnMetrics(t.revenue, t.grossProfit, mailCost);
                return (
                  <tr key={m}>
                    <td>
                      <button
                        className={styles.secondary}
                        onClick={() => setSelectedMonth(m)}
                        aria-label={"View profit jobs for " + monthName(m)}
                      >
                        {monthName(m)}
                      </button>
                    </td>
                    <td>{t.invoicedJobs}</td>
                    <td>{money(t.revenue)}</td>
                    <td>
                      {money(t.grossProfit)}
                      <small>{t.provisionalJobs ? "Provisional" : ""}</small>
                    </td>
                    <td>
                      {t.reconciledJobs ? money(t.finalProfit) : "Not ready"}
                    </td>
                    <td>{money(mailCost)}{basis === "mailing" && <small>{costGroup.complete ? "Vendor + postage covered" : "Partial cost"}</small>}</td>
                    <td>
                      {basis === "mailing"
                        ? money(
                            t.grossProfit === null || mailCost === null
                              ? null
                              : roundMoney(t.grossProfit - mailCost),
                          )
                        : `${t.provisionalJobs} provisional · ${t.reconciledJobs} reconciled`}
                    </td>
                    {basis === "mailing" && <><td>{returns.roas === null ? "Pending" : returns.roas.toFixed(2)+"×"}<small>Provisional</small></td><td>{returns.roi === null ? "Pending" : (returns.roi*100).toFixed(1)+"%"}<small>Provisional</small></td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>
              {selectedMonth === "all"
                ? "Every Direct Mail job"
                : monthName(selectedMonth) + " · job detail"}
            </h2>
            <p>
              {visible.length} jobs · open a job or its cost breakdown to
              inspect the numbers.
            </p>
          </div>
          <button
            className={styles.secondary}
            onClick={() => exportJobs(visible, d)}
          >
            Export job profit CSV
          </button>
        </div>
        <div className={styles.toolbar}>
          <input
            aria-label="Search profit jobs"
            placeholder="Search name or job number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Profit job filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All jobs</option>
            <option value="invoiced">Invoiced jobs</option>
            <option value="provisional">Provisional profit</option>
            <option value="reconciled">Reconciled profit</option>
          </select>
          {selectedMonth !== "all" && (
            <button
              className={styles.secondary}
              onClick={() => setSelectedMonth("all")}
            >
              Show all months
            </button>
          )}
        </div>
        <JobProfitTable jobs={visible} />
      </section>
    </>
  );
}
