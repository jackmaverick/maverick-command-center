"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  neighborhoodIsStale,
  neighborhoodSchema,
  type NeighborhoodReview,
} from "@/lib/direct-mail/neighborhoods";

const money = (n: number | null) =>
  n === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);
const words = (s: string) => s.replaceAll("_", " ");
const box = "rounded-xl border border-slate-700 bg-slate-900/60 p-5";
const muted = "text-sm leading-6 text-slate-400";
const date = (s: string | null) =>
  s
    ? new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Unconfirmed";

export default function NeighborhoodOpportunities({
  review,
}: {
  review?: NeighborhoodReview;
}) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const remote = useQuery({
    queryKey: ["direct-mail-neighborhoods"],
    enabled: !review,
    queryFn: async () => {
      const response = await fetch("/api/direct-mail/neighborhoods", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Neighborhood evidence unavailable");
      return neighborhoodSchema.parse((await response.json()).data);
    },
    retry: false,
    refetchInterval: 60000,
  });
  review = review ?? remote.data;
  if (!review)
    return (
      <section className={box}>
        <h2 className="text-lg font-semibold">Neighborhoods & yard signs</h2>
        <p className={muted}>
          {remote.isPending
            ? "Loading neighborhood evidence…"
            : "The neighborhood evidence could not be loaded. It may need publishing or refreshing. No mailing recommendation is available."}
        </p>
      </section>
    );
  const stale = neighborhoodIsStale(review.asOf);
  const rows = review.opportunities.filter((o) =>
    `${o.neighborhood} ${o.jobs.map((j) => j.number).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const chosen = rows.find((o) => o.id === selection) ?? rows[0];
  const timing = review.delivery.request_to_seed;
  return (
    <div className="space-y-5 text-slate-100">
      <header className={box}>
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Roofing activity → neighborhood mail → yard signs
            </h2>
            <p className={muted}>
              Insurance roofs qualify regardless of lead source. Each area gets
              one evidence-based preparation decision.
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Reviewed{" "}
            {new Date(review.asOf).toLocaleString("en-US", {
              timeZone: "America/Chicago",
            })}{" "}
            CT
          </span>
        </div>
        {stale && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-amber-950 p-3 text-amber-200"
          >
            This review is over 24 hours old or has an invalid time. Refresh
            job, roof and suppression evidence before preparing mail.
          </p>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <span className={muted}>Submission to home copy</span>
            <p className="text-2xl">
              {timing.mean_days === null
                ? "Unknown"
                : `${timing.mean_days} days`}
            </p>
            <small className="text-slate-400">
              {timing.exact_n} exact observations · {words(timing.confidence)}.
              Home copies do not prove every household received mail.
            </small>
          </div>
          <div>
            <span className={muted}>Ron preparation buffer</span>
            <p className="text-2xl">{review.ronPrepCalendarDays} calendar days</p>
            <small className="text-slate-400">
              Planning fallback. His promised date takes precedence; actual
              postal entry remains a separate observation.
            </small>
          </div>
          <div>
            <span className={muted}>Neighborhood decisions</span>
            <p className="text-2xl">{review.opportunities.length}</p>
            <small className="text-slate-400">
              {review.changes.length} changes since the preceding run. Priority
              scores guide review; they do not predict ROI or authorize sending.
            </small>
          </div>
        </div>
      </header>
      <label className="block text-sm">
        Find a neighborhood or JobNimbus job number
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-600 bg-slate-950 p-3"
          placeholder="Highlands of Kensington, 2377…"
        />
      </label>
      <div className="grid gap-5 xl:grid-cols-[minmax(260px,1fr)_2fr]">
        <nav
          aria-label="Neighborhood opportunities"
          className="max-h-[760px] space-y-2 overflow-y-auto"
        >
          {rows.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelection(o.id)}
              className={`w-full rounded-lg border p-4 text-left ${chosen?.id === o.id ? "border-sky-500 bg-sky-950/50" : "border-slate-700 bg-slate-900/60"}`}
            >
              <div className="flex justify-between gap-2">
                <strong>{o.neighborhood}</strong>
                <span className="text-xs text-slate-400">
                  {o.priority_score} pts
                </span>
              </div>
              <p className="mt-2 text-sm text-amber-200">
                {stale ? "Refresh evidence" : words(o.action)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {o.roofs.length} roof records ·{" "}
                {o.eligible_count ?? "Unverified"} eligible addresses
              </p>
            </button>
          ))}
          {!rows.length && (
            <p className={muted}>No matching neighborhoods in this review.</p>
          )}
        </nav>
        {chosen && (
          <article className={`${box} space-y-5`}>
            <div>
              <h3 className="text-xl font-semibold">{chosen.neighborhood}</h3>
              <p className="mt-2 text-amber-200">
                Next: {stale ? "refresh evidence" : words(chosen.action)}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {chosen.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
            <section>
              <h4 className="font-semibold">Why this neighborhood</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {chosen.jobs.map((j) => (
                  <a
                    key={j.id}
                    href={`https://app.jobnimbus.com/job/${encodeURIComponent(j.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-slate-600 px-3 py-2 text-sm text-sky-300"
                  >
                    Job #{j.number} · {j.lead_source} ↗
                  </a>
                ))}
              </div>
              <ul className={`${muted} mt-2`}>
                {chosen.roofs.map((r, i) => (
                  <li key={`${r.job_id}-${i}`}>
                    {date(r.install_date)} · Roofing · {r.status}
                  </li>
                ))}
              </ul>
              <p className={muted}>
                Copy basis: {words(chosen.copy_lane)}. Scheduled work alone does
                not support “you’ve seen us roofing.”
              </p>
            </section>
            <section className="rounded-lg bg-slate-950/70 p-4">
              <h4 className="font-semibold">Map & audience decision</h4>
              <p className="mt-2 text-sky-300">{words(chosen.map_action)}</p>
              <p className={muted}>
                {chosen.eligible_count ?? "Unknown"} currently eligible.{" "}
                {chosen.historical_count ?? "No"} historical addresses in
                matched packages; those packages can cover several neighborhoods
                and are not a current mailing count.
              </p>
              <p className={muted}>
                {chosen.previous_delivery
                  ? `Previous request ${date(chosen.previous_delivery.requested)} · Ron promised ${date(chosen.previous_delivery.vendor_planned_postal)} · postal confirmed ${date(chosen.previous_delivery.postal_confirmed)} · home copy ${date(chosen.previous_delivery.seed_arrived)}`
                  : "No prior linked request found."}
              </p>
              <p className={muted}>
                Earliest repeat: {date(chosen.earliest_repeat)}. A hail
                observation at one house does not establish coverage for every
                recipient.
              </p>
            </section>
            <section>
              <h4 className="font-semibold">
                Working timeline · conditional on preparation approval
              </h4>
              <ol className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["Submit package", date(chosen.timing.request_date)],
                  [
                    "Postal entry",
                    `${date(chosen.timing.postal_date)} · ${words(chosen.timing.postal_basis)}`,
                  ],
                  [
                    "Home-copy estimate",
                    `${date(chosen.timing.arrival_earliest)}–${date(chosen.timing.arrival_latest)}`,
                  ],
                ].map(([label, value]) => (
                  <li
                    key={label}
                    className="rounded border border-slate-700 p-3"
                  >
                    <small className="text-slate-400">{label}</small>
                    <p className="mt-1 text-sm">{value}</p>
                  </li>
                ))}
              </ol>
              <p className={`${muted} mt-2`}>
                Arrival basis: {words(chosen.timing.arrival_basis)} ·{" "}
                {chosen.timing.sample_n} samples. No exact date is inferred from
                an unlinked “Saturday or Sunday” report.
              </p>
            </section>
            <section>
              <h4 className="font-semibold">Yard-sign coordination</h4>
              <p className={muted}>
                Place by {date(chosen.signs.placement_due)} during the
                preparation buffer; retain through at least{" "}
                {date(chosen.signs.retain_through)} and recheck after a
                postal-date change.
              </p>
              <p className="mt-2 text-sm">
                {chosen.signs.planned_count} recorded plans ·{" "}
                {chosen.signs.verified_count} placements verified in the current
                freshness window.
              </p>
              <p className="mt-2 text-sm text-amber-200">
                {chosen.signs.can_claim_signs && !stale
                  ? "Current placement evidence supports yard-sign copy."
                  : "Yard-sign copy is on hold until the owner, location, permission and placement photo are verified."}
              </p>
              <p className={muted}>
                Next field step: {words(chosen.signs.action)}. Record placement
                and home-copy arrival in the private evidence ledger through the
                direct-mail operator; this page does not send instructions to
                the crew.
              </p>
            </section>
            <section>
              <h4 className="font-semibold">Economics & comparable roofs</h4>
              <p className={muted}>
                Estimated mailing cost:{" "}
                {money(chosen.economics.estimated_mail_cost)}. Whole-job profit
                is a scenario input, not an expected return.
              </p>
              <div className="mt-3 space-y-3">
                {chosen.financials.map((f) => (
                  <div
                    key={f.job_id}
                    className="rounded border border-slate-700 p-3 text-sm"
                  >
                    <p>
                      Invoice {money(f.invoice_total)} · known cost{" "}
                      {money(f.known_cost)} · GP {money(f.gross_profit)} (
                      {f.margin_percent ?? "?"}%)
                    </p>
                    <p className="mt-1 text-slate-400">
                      {f.roof_squares ?? "Unknown"} measured roof squares ·{" "}
                      {money(f.invoice_per_roof_square)}/square invoiced ·{" "}
                      {money(f.gp_per_roof_square)}/square GP · home value{" "}
                      {money(f.home_value)}
                    </p>
                    {f.home_value_basis && (
                      <p className={muted}>
                        {f.home_value_basis} · observed{" "}
                        {f.home_value_observed_at?.slice(0, 10) ??
                          "date unknown"}
                      </p>
                    )}
                    <p className="mt-1 text-amber-200">
                      {words(f.profit_state)}
                      {f.blockers.length
                        ? ` · ${f.blockers.map(words).join(", ")}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
              <p className={muted}>
                Per-square figures divide whole-job revenue/cost by measured net
                roof area and may include other trades. Living area is never
                substituted for roof squares.
              </p>
            </section>
            <details className="text-sm">
              <summary className="cursor-pointer text-sky-300">
                Review priority evidence
              </summary>
              <ul className="mt-2 list-disc pl-5 text-slate-400">
                {Object.entries(chosen.score_reasons).map(
                  ([reason, points]) => (
                    <li key={reason}>
                      {words(reason)}: {points}
                    </li>
                  ),
                )}
              </ul>
            </details>
          </article>
        )}
      </div>
      <section className={box}>
        <h3 className="font-semibold">Profit examples to investigate</h3>
        <p className={muted}>
          Compare both measured roof size and home value when available. A
          single matching signal is a lead for research; it does not clear
          mailing eligibility.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {review.profitExamples.map((p) => (
            <div key={p.job.id} className="rounded border border-slate-700 p-3">
              <a
                className="text-sky-300"
                href={`https://app.jobnimbus.com/job/${encodeURIComponent(p.job.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                Job #{p.job.number} ↗
              </a>
              <p className="mt-1">
                {money(p.metrics.gross_profit)} GP · {p.metrics.margin_percent}%
              </p>
              <p className={muted}>
                {p.comparisonCount} single-or-both-signal comparisons;{" "}
                {p.bothSignalsCount} match both.
                {p.missingHomeValue ? " Example home value is missing." : ""}
                {p.missingRoofSquares
                  ? " Example roof measurement is missing."
                  : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
      <details className={box}>
        <summary className="cursor-pointer">
          Evidence graph · {review.graph.nodeCount} nodes /{" "}
          {review.graph.edgeCount} links
        </summary>
        <p className={`${muted} mt-3`}>
          Job → property → verified neighborhood → original audience → storm
          footprint → dated mailing → postal/arrival evidence → sign placement.
          Stable identities preserve that chain between runs.
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-slate-400 sm:grid-cols-3">
          {Object.entries(review.graph.relations).map(([label, n]) => (
            <li key={label}>
              {words(label)}: {n}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
