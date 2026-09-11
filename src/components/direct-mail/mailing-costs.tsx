"use client";
import { useState } from "react";
import type { WeeklyReview } from "@/lib/direct-mail/weekly";
import { allocationCost, mailingCosts, returnMetrics } from "@/lib/direct-mail/costs";
import { profitTotals } from "@/lib/direct-mail/profit";
import { useJobProfits } from "./job-profit";
import styles from "@/app/direct-mail/weekly.module.css";
const money = (n: number | null) => n === null ? "Pending" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const ratio = (n: number | null) => n === null ? "Pending" : n.toFixed(2) + "×";
export function MailReturns({ d, reviewId }: { d: WeeklyReview; reviewId: string }) {
  const q = useJobProfits(reviewId);
  const costs = mailingCosts(d);
  const totals = q.data ? profitTotals(q.data.jobs) : null;
  const returns = returnMetrics(totals?.revenue ?? null, totals?.grossProfit ?? null, costs.known);
  const applied = d.cashReview ? d.cashReview.jobs.reduce((s,j) => s+j.applied,0) : null;
  const unapplied = d.cashReview ? d.cashReview.jobs.reduce((s,j) => s+j.unapplied,0) : null;
  return <section className={styles.panel}>
    <div className={styles.panelHead}><div><h2>Return against documented mailing costs</h2><p>Direct Mail channel results to date. Missing expenses can overstate returns.</p></div></div>
    <div className={styles.profitMetrics}>
      <div><small>Documented cost basis</small><strong>{money(costs.known)}</strong><small>{costs.covered} of {costs.count} lists have vendor + postage coverage</small></div>
      <div><small>Revenue / documented cost</small><strong>{ratio(returns.roas)}</strong><small>Provisional ROAS · {money(totals?.revenue ?? null)} invoiced</small></div>
      <div><small>Profit ROI to date</small><strong>{returns.roi === null ? "Pending" : (returns.roi*100).toFixed(1)+"%"}</strong><small>Provisional · GP less mail cost {money(returns.contribution)}</small></div>
      <div><small>Customer cash applied</small><strong>{money(applied)}</strong><small>{money(unapplied)} unapplied, shown separately</small></div>
    </div>
    <p className={styles.profitNote}>ROAS = invoiced revenue ÷ mailing cost. Profit ROI = (job gross profit − mailing cost) ÷ mailing cost. These are channel comparisons, not proof that a particular send caused a sale. The cost basis includes received Ron invoices and recovered postal statement charges, with stamps counted once. Missing vendor bills, postage and rework remain excluded; this is not final ROI or confirmed postal cash paid.</p>
    {q.isError && <p>Current job profit could not be loaded. <button className={styles.secondary} onClick={() => q.refetch()}>Retry</button></p>}
    {d.cashReview && <>
      <h3>Customer collections by payment month</h3>
      <div className={styles.tableWrap}><table><thead><tr><th>Payment month</th><th>Applied to invoices</th><th>Unapplied receipts</th></tr></thead><tbody>{d.cashReview.months.map(m => <tr key={m.month}><td>{m.month}</td><td>{money(m.applied)}</td><td>{money(m.unapplied)}</td></tr>)}</tbody></table></div>
      <p className={styles.profitNote}>{d.cashReview.note} Verified {new Date(d.cashReview.verifiedAt).toLocaleString("en-US", {timeZone:"America/Chicago"})} Chicago. Refreshing job costs does not refresh this reviewed cash snapshot.</p>
    </>}
  </section>;
}
export default function MailingCosts({ d, reviewId }: { d: WeeklyReview; reviewId: string }) {
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  if (!d.costReview) return <section className={styles.panel}><h2>Mailing cost review pending</h2></section>;
  const rows = d.costReview.allocations.map(a => ({...a, campaign:d.campaigns.find(c => c.id===a.campaignId)!, cost:allocationCost(a)}))
    .filter(a => (month === "all" || a.campaign.requestedDate.startsWith(month)) && a.campaign.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sort === "cost" ? (b.cost.known ?? -1)-(a.cost.known ?? -1) : b.campaign.requestedDate.localeCompare(a.campaign.requestedDate));
  const totals = mailingCosts(d, rows.map(a=>a.campaignId));
  return <section className={styles.panel}>
    <div className={styles.panelHead}><div><h2>Connect every mailing to its cost</h2><p>Invoice charges, shared allocations and additional postage, with source links.</p></div></div>
    <div className={styles.toolbar}>
      <a className={styles.secondary} href={"/api/direct-mail/weekly/export?view=costs&id="+reviewId}>Export all mailing costs</a>
      <label>Request month <select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All months</option>{d.months.map(m=><option key={m.month}>{m.month}</option>)}</select></label>
      <label>Find list <input aria-label="Find mailing cost list" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Neighborhood" /></label>
      <label>Sort <select value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Latest request</option><option value="cost">Highest documented cost</option></select></label>
    </div>
    <div className={styles.profitMetrics}>
      <div><small>Allocated vendor invoices</small><strong>{money(totals.vendor)}</strong><small>Received invoices count as committed cost</small></div>
      <div><small>Additional documented postage</small><strong>{money(totals.postage)}</strong><small>Excludes stamps already in vendor charges</small></div>
      <div><small>Documented cost subtotal</small><strong>{money(totals.known)}</strong><small>{totals.complete ? "Vendor + postage covered" : "Partial coverage; missing costs are not zero"}</small></div>
    </div>
    <div className={styles.tableWrap}><table><thead><tr>{["Mailing / request date", "Ron invoice", "Postage added", "Documented cost", "Coverage / remaining work"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {rows.map(a=><tr key={a.campaignId}>
        <td className={styles.listName}><strong>{a.campaign.name}</strong><small>{a.campaign.requestedDate} · {a.campaign.requested.toLocaleString()} requested rows</small><small>{a.postal ? a.postal.pieces.toLocaleString()+" postal statement pieces" : "Postal piece count pending"}</small></td>
        <td>{money(a.vendorCost)}<small>{a.method === "allocated" ? "Shared invoice allocation" : a.method === "exact" ? "Individual list charges" : "Invoice pending"}</small>{a.invoiceNumber && <a href={d.invoices.find(i=>i.number===a.invoiceNumber)!.invoiceEvidence} target="_blank" rel="noreferrer">Invoice #{a.invoiceNumber}</a>}</td>
        <td>{money(a.cost.postage)}{a.postal && <><small>{a.postal.stamps === "in_vendor" ? "Net due; stamps in Ron invoice" : a.postal.stamps === "outside_vendor" ? "Full postage incl. stamps" : "Net due only; stamp split pending"}</small><a href={a.postal.evidence} target="_blank" rel="noreferrer">Postal statement</a></>}</td>
        <td><strong>{money(a.cost.known)}</strong><small>{a.cost.label}</small></td>
        <td className={styles.listName}>{a.gaps.map(g=><small key={g}>{g}</small>)}<details><summary>Allocation method</summary><p>{a.note}</p></details></td>
      </tr>)}
    </tbody></table></div>
    <p className={styles.profitNote}>Postage statements document charges; they do not establish bank payment, USPS acceptance or delivery. April and June invoice totals are allocated by requested-row share and reconcile to the penny, including discounts and tax. May and July use individual invoiced list amounts. Corrected copies of the same postal statement count once. Reviewed {new Date(d.costReview.reviewedAt).toLocaleString("en-US",{timeZone:"America/Chicago"})} Chicago.</p>
  </section>;
}
