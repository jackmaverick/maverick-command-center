"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Rate {
  count: number;
  sampleSize: number;
  percent: number;
}

interface SourceMetric {
  source: string;
  totalLeads: number;
  medianFirstTouchMinutes: number | null;
  touchSampleSize: number;
  neverTouchedCount: number;
  neverTouchedPercent: number;
  contactedCount: number;
  contactSampleSize: number;
  contactRate: number;
  bookedCount: number;
  bookingSampleSize: number;
  bookedPercent: number;
}

interface MissedCallMetric {
  line: string;
  missedCount: number;
  inboundCount: number;
  missedPercent: number;
  missedSampleSize: number;
  medianCallbackMinutes: number | null;
  callbackSampleSize: number;
  neverCalledBackCount: number;
  neverCalledBackPercent: number;
  neverCalledBackSampleSize: number;
}

interface MetricsData {
  period: {
    key: string;
    label: string;
    start: string;
    end: string;
    timeZone: string;
  };
  definitions: {
    cleanLead: string;
    automaticOpeners: string;
    conversation: string;
    booked: string;
    businessHours: string;
  };
  persistence: {
    neverReachedN: number;
    averageAttempts: number;
    buckets: Array<Rate & { label: string }>;
  };
  contact: {
    within7Days: Rate;
    within30Days: Rate;
    medianFirstConversationMinutes: number | null;
    conversationSampleSize: number;
  };
  sources: SourceMetric[];
  missedCalls: MissedCallMetric[];
  appointmentToEstimate: {
    retailRepairs: {
      appointments: number;
      estimateSentCount: number;
      estimateSentPercent: number;
      sampleSize: number;
      medianDaysToEstimateSent: number | null;
      timingSampleSize: number;
    };
    insurance: {
      appointments: number;
      estimateSentPercent: null;
      sampleSize: number;
      note: string;
    };
    builtNeverSent: {
      builtCount: number;
      neverSentCount: number;
      neverSentPercent: number;
      sampleSize: number;
    };
  };
  coverage: {
    unassigned: Rate;
    answerConnect: {
      total: number;
      businessHoursCount: number;
      businessHoursPercent: number;
      businessHoursSampleSize: number;
      afterHoursCount: number;
      afterHoursPercent: number;
      afterHoursSampleSize: number;
    };
  };
  caveats: { missedCalls: string };
}

const PERIODS = [
  { value: "six_months", label: "Last 6 Months" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
];

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remainder = Math.round(minutes % 60);
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }
  return `${(minutes / 1440).toFixed(1)} days`;
}

function MetricCard({
  label,
  value,
  sampleSize,
  detail,
  warning,
}: {
  label: string;
  value: string;
  sampleSize?: number;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
      <p className="text-xs font-medium text-[#8b949e]">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          warning ? "text-[#d29922]" : "text-[#e6edf3]"
        }`}
      >
        {value}
      </p>
      {sampleSize !== undefined && (
        <p className="mt-1 text-xs text-[#8b949e]">N = {sampleSize}</p>
      )}
      {detail && <p className="mt-2 text-xs leading-relaxed text-[#8b949e]">{detail}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-lg border border-[#30363d] bg-[#0d1117] p-5">
      <h2 className="text-lg font-semibold text-[#e6edf3]">{title}</h2>
      <p className="mt-1 text-sm text-[#8b949e]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <Skeleton key={item} className="h-48 w-full bg-[#161b22]" />
      ))}
    </div>
  );
}

export default function MetricsPage() {
  const [period, setPeriod] = useState("six_months");
  const { data, isLoading, isError } = useQuery<MetricsData>({
    queryKey: ["front-funnel-metrics", period],
    queryFn: async () => {
      const response = await fetch(
        `/api/metrics/front-funnel?period=${encodeURIComponent(period)}`
      );
      if (!response.ok) throw new Error("Failed to load front-funnel metrics");
      return response.json();
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Front-Funnel Metrics</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#8b949e]">
            Lead persistence, contact, booking, callback, and estimate handoff using the
            shared clean-lead cohort.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[190px] border-[#30363d] bg-[#161b22] text-[#e6edf3]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[#30363d] bg-[#161b22]">
            {PERIODS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data && (
        <div className="mb-6 flex gap-3 rounded-lg border border-[#30363d] bg-[#161b22] p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#58a6ff]" />
          <div className="text-xs leading-relaxed text-[#8b949e]">
            <p>{data.definitions.cleanLead}.</p>
            <p>
              {data.definitions.conversation}. {data.definitions.automaticOpeners}.
            </p>
            <p>
              Boundaries use {data.period.timeZone}; current selection: {data.period.label}.
            </p>
          </div>
        </div>
      )}

      {isLoading && <LoadingState />}

      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          Front-funnel metrics could not be loaded. Check the database connection and try
          again.
        </div>
      )}

      {data && (
        <>
          <Section
            title="1. Persistence on never-reached leads"
            description="Human outbound calls and non-automated texts before contact. Only leads with a full 30-day observation window are included."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Average attempts"
                value={data.persistence.averageAttempts.toFixed(1)}
                sampleSize={data.persistence.neverReachedN}
              />
              {data.persistence.buckets.map((bucket) => (
                <MetricCard
                  key={bucket.label}
                  label={`${bucket.label} attempts`}
                  value={`${bucket.percent.toFixed(1)}%`}
                  sampleSize={bucket.sampleSize}
                  detail={`${bucket.count} never-reached leads`}
                />
              ))}
            </div>
          </Section>

          <Section
            title="2. Contact rate"
            description="A real conversation is an incoming text or a completed call of at least 30 seconds."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Contact within 7 days"
                value={`${data.contact.within7Days.percent.toFixed(1)}%`}
                sampleSize={data.contact.within7Days.sampleSize}
                detail={`${data.contact.within7Days.count} contacted`}
              />
              <MetricCard
                label="Contact within 30 days"
                value={`${data.contact.within30Days.percent.toFixed(1)}%`}
                sampleSize={data.contact.within30Days.sampleSize}
                detail={`${data.contact.within30Days.count} contacted`}
              />
              <MetricCard
                label="Median time to first conversation"
                value={formatDuration(data.contact.medianFirstConversationMinutes)}
                sampleSize={data.contact.conversationSampleSize}
              />
            </div>
          </Section>

          <Section
            title="3. Speed, contact, and booking by source"
            description={`${data.definitions.booked}. This provisional definition is shared and can be swapped in one place.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] text-left text-xs text-[#8b949e]">
                    <th className="pb-3 font-medium">Source</th>
                    <th className="pb-3 text-right font-medium">Leads</th>
                    <th className="pb-3 text-right font-medium">Median first touch</th>
                    <th className="pb-3 text-right font-medium">Never touched</th>
                    <th className="pb-3 text-right font-medium">Contact ≤30d</th>
                    <th className="pb-3 text-right font-medium">Booked (provisional)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((source) => (
                    <tr key={source.source} className="border-b border-[#21262d]">
                      <td className="py-3 font-medium text-[#e6edf3]">{source.source}</td>
                      <td className="py-3 text-right font-mono text-[#8b949e]">
                        {source.totalLeads}
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {formatDuration(source.medianFirstTouchMinutes)}
                        <span className="block text-[10px] text-[#8b949e]">
                          N = {source.touchSampleSize}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {source.neverTouchedPercent.toFixed(1)}%
                        <span className="block text-[10px] text-[#8b949e]">
                          {source.neverTouchedCount} · N = {source.totalLeads}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {source.contactRate.toFixed(1)}%
                        <span className="block text-[10px] text-[#8b949e]">
                          {source.contactedCount} · N = {source.contactSampleSize}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {source.bookedPercent.toFixed(1)}%
                        <span className="block text-[10px] text-[#8b949e]">
                          {source.bookedCount} · N = {source.bookingSampleSize}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="4. Missed calls and callback"
            description="Inbound no-answer calls matched to a clean lead, followed by the next outbound call to that lead."
          >
            <div className="mb-5 flex gap-3 rounded-md border border-[#d29922]/30 bg-[#d29922]/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d29922]" />
              <p className="text-xs leading-relaxed text-[#d29922]">
                Lower bound / unverified: {data.caveats.missedCalls}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] text-left text-xs text-[#8b949e]">
                    <th className="pb-3 font-medium">Line</th>
                    <th className="pb-3 text-right font-medium">Missed</th>
                    <th className="pb-3 text-right font-medium">Median callback</th>
                    <th className="pb-3 text-right font-medium">Never called back</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missedCalls.map((line) => (
                    <tr key={line.line} className="border-b border-[#21262d]">
                      <td className="py-3 font-medium text-[#e6edf3]">{line.line}</td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {line.missedPercent.toFixed(1)}%
                        <span className="block text-[10px] text-[#8b949e]">
                          {line.missedCount} · N = {line.missedSampleSize}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {formatDuration(line.medianCallbackMinutes)}
                        <span className="block text-[10px] text-[#8b949e]">
                          N = {line.callbackSampleSize}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#e6edf3]">
                        {line.neverCalledBackPercent.toFixed(1)}%
                        <span className="block text-[10px] text-[#8b949e]">
                          {line.neverCalledBackCount} · N = {line.neverCalledBackSampleSize}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="5. Appointment to estimate sent"
            description="Appointment-scheduled and Estimate Sent stage history for the selected clean-lead cohort."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Retail/Repairs appointments with estimate sent"
                value={`${data.appointmentToEstimate.retailRepairs.estimateSentPercent.toFixed(1)}%`}
                sampleSize={data.appointmentToEstimate.retailRepairs.sampleSize}
                detail={`${data.appointmentToEstimate.retailRepairs.estimateSentCount} sent`}
              />
              <MetricCard
                label="Median appointment → estimate sent"
                value={
                  data.appointmentToEstimate.retailRepairs.medianDaysToEstimateSent === null
                    ? "N/A"
                    : `${data.appointmentToEstimate.retailRepairs.medianDaysToEstimateSent.toFixed(1)} days`
                }
                sampleSize={data.appointmentToEstimate.retailRepairs.timingSampleSize}
              />
              <MetricCard
                label="Built estimates never sent"
                value={`${data.appointmentToEstimate.builtNeverSent.neverSentPercent.toFixed(1)}%`}
                sampleSize={data.appointmentToEstimate.builtNeverSent.sampleSize}
                detail={`${data.appointmentToEstimate.builtNeverSent.neverSentCount} never sent`}
              />
              <MetricCard
                label="Insurance estimate sent"
                value="N/A"
                sampleSize={data.appointmentToEstimate.insurance.sampleSize}
                detail={data.appointmentToEstimate.insurance.note}
              />
            </div>
          </Section>

          <Section
            title="6. Assignment and AnswerConnect overflow"
            description={data.definitions.businessHours}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Clean leads with no rep"
                value={`${data.coverage.unassigned.percent.toFixed(1)}%`}
                sampleSize={data.coverage.unassigned.sampleSize}
                detail={`${data.coverage.unassigned.count} unassigned`}
              />
              <MetricCard
                label="AnswerConnect during business hours"
                value={`${data.coverage.answerConnect.businessHoursPercent.toFixed(1)}%`}
                sampleSize={data.coverage.answerConnect.businessHoursSampleSize}
                detail={`${data.coverage.answerConnect.businessHoursCount} calls`}
              />
              <MetricCard
                label="AnswerConnect after hours"
                value={`${data.coverage.answerConnect.afterHoursPercent.toFixed(1)}%`}
                sampleSize={data.coverage.answerConnect.afterHoursSampleSize}
                detail={`${data.coverage.answerConnect.afterHoursCount} calls`}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
