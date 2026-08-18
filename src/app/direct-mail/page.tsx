"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BarChart3 as BarChart3Icon,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers,
  Mail,
  MapPin,
  MousePointer2,
  Printer,
  RadioTower,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DIRECT_MAIL_BATCH,
  DIRECT_MAIL_CAMPAIGNS,
  DIRECT_MAIL_PERFORMANCE,
  DIRECT_MAIL_PROCESS_STEPS,
  DirectMailCampaignCell,
  DirectMailPerformanceCell,
  getDirectMailPerformanceSummary,
  getDirectMailSummary,
} from "@/lib/direct-mail/june-2026-olathe-hail";
import { cn } from "@/lib/utils";

const statusConfig = {
  intake: {
    label: "Intake",
    dot: "bg-[#d29922]",
    text: "text-[#d29922]",
    bg: "bg-[#d29922]/10",
    border: "border-[#d29922]/30",
  },
  sent_to_ron: {
    label: "Sent to Ron",
    dot: "bg-[#58a6ff]",
    text: "text-[#58a6ff]",
    bg: "bg-[#58a6ff]/10",
    border: "border-[#58a6ff]/30",
  },
  confirmed_sent: {
    label: "Confirmed Sent",
    dot: "bg-[#3fb950]",
    text: "text-[#3fb950]",
    bg: "bg-[#3fb950]/10",
    border: "border-[#3fb950]/30",
  },
  responding: {
    label: "Responding",
    dot: "bg-[#a371f7]",
    text: "text-[#a371f7]",
    bg: "bg-[#a371f7]/10",
    border: "border-[#a371f7]/30",
  },
  resend_due: {
    label: "Resend Due",
    dot: "bg-[#f85149]",
    text: "text-[#f85149]",
    bg: "bg-[#f85149]/10",
    border: "border-[#f85149]/30",
  },
} as const;

const campaignColors = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#a371f7",
  "#f778ba",
  "#56d4dd",
  "#ffa657",
  "#7ee787",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Pending";
  return `${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not confirmed";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="flex items-center gap-2 text-[#8b949e] text-xs mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#e6edf3]">{value}</div>
      <div className="text-xs text-[#8b949e] mt-1">{detail}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DirectMailCampaignCell["status"] }) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        config.bg,
        config.border,
        config.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

function CampaignMap({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative min-h-[500px] overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117]">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-[9%] top-0 h-full w-px bg-[#30363d]" />
        <div className="absolute left-[25%] top-0 h-full w-px bg-[#30363d]" />
        <div className="absolute left-[42%] top-0 h-full w-px bg-[#30363d]" />
        <div className="absolute left-[58%] top-0 h-full w-px bg-[#30363d]" />
        <div className="absolute left-[75%] top-0 h-full w-px bg-[#30363d]" />
        <div className="absolute top-[20%] left-0 h-px w-full bg-[#30363d]" />
        <div className="absolute top-[40%] left-0 h-px w-full bg-[#30363d]" />
        <div className="absolute top-[60%] left-0 h-px w-full bg-[#30363d]" />
        <div className="absolute top-[80%] left-0 h-px w-full bg-[#30363d]" />
      </div>

      <div className="absolute left-4 top-4 z-20 rounded-md border border-[#30363d] bg-[#161b22]/95 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-[#e6edf3]">
          <Layers className="h-4 w-4 text-[#58a6ff]" />
          Campaign cells
        </div>
        <div className="mt-1 text-[11px] text-[#8b949e]">
          Approximate geography until address geocoding is enabled.
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 rounded-md border border-[#30363d] bg-[#161b22]/95 px-3 py-2 text-[11px] text-[#8b949e]">
        West Olathe / De Soto
      </div>
      <div className="absolute bottom-4 right-4 z-20 rounded-md border border-[#30363d] bg-[#161b22]/95 px-3 py-2 text-[11px] text-[#8b949e]">
        Central Olathe
      </div>
      <div className="absolute right-4 top-4 z-20 rounded-md border border-[#30363d] bg-[#161b22]/95 px-3 py-2 text-[11px] text-[#8b949e]">
        Shawnee
      </div>

      {DIRECT_MAIL_CAMPAIGNS.map((campaign, index) => {
        const selected = selectedId === campaign.id;
        const color = campaignColors[index % campaignColors.length];
        const size = Math.max(36, campaign.map.radius * 13);
        return (
          <button
            key={campaign.id}
            type="button"
            onClick={() => onSelect(campaign.id)}
            className={cn(
              "absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border text-left transition-all hover:z-30 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#58a6ff]",
              selected ? "z-30 scale-110 border-[#e6edf3]" : "border-white/20"
            )}
            style={{
              left: `${campaign.map.x}%`,
              top: `${campaign.map.y}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: `${color}2b`,
              boxShadow: selected
                ? `0 0 0 5px ${color}30, 0 0 32px ${color}55`
                : `0 0 24px ${color}22`,
            }}
            aria-label={`Select ${campaign.name}`}
          >
            <span
              className="absolute inset-2 rounded-full border"
              style={{ borderColor: `${color}80` }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="sr-only">{campaign.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function CampaignDetail({ campaign }: { campaign: DirectMailCampaignCell }) {
  const excluded = campaign.sheetRows - campaign.usableRows;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <MapPin className="h-4 w-4" />
            {campaign.city} · {campaign.county}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[#e6edf3]">
            {campaign.name}
          </h2>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
          <div className="text-xs text-[#8b949e]">Sheet rows</div>
          <div className="mt-1 font-mono text-lg text-[#e6edf3]">
            {formatNumber(campaign.sheetRows)}
          </div>
        </div>
        <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
          <div className="text-xs text-[#8b949e]">Usable rows</div>
          <div className="mt-1 font-mono text-lg text-[#e6edf3]">
            {formatNumber(campaign.usableRows)}
          </div>
        </div>
        <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
          <div className="text-xs text-[#8b949e]">Sent to mailhouse</div>
          <div className="mt-1 font-mono text-lg text-[#e6edf3]">
            {formatDateTime(campaign.sentToRonAt)}
          </div>
        </div>
        <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
          <div className="text-xs text-[#8b949e]">Postal drop</div>
          <div className="mt-1 font-mono text-lg text-[#8b949e]">
            {formatDate(campaign.confirmedSentAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex items-start gap-2 text-[#8b949e]">
          <Printer className="mt-0.5 h-4 w-4 text-[#d29922]" />
          <span>
            Mailhouse request is recorded. Add the final postal drop date once
            Ron / Mail Works confirms print and mail completion.
          </span>
        </div>
        <div className="flex items-start gap-2 text-[#8b949e]">
          <RadioTower className="mt-0.5 h-4 w-4 text-[#58a6ff]" />
          <span>{campaign.notes}</span>
        </div>
        {excluded > 0 ? (
          <div className="flex items-start gap-2 text-[#d29922]">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{excluded} malformed row(s) should be excluded internally.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}


function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 shadow-xl">
      <div className="mb-1 text-xs font-medium text-[#e6edf3]">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${item.name}-${item.value}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color ?? "#58a6ff" }}
            />
            <span className="text-[#8b949e]">{item.name}</span>
            <span className="font-mono text-[#e6edf3]">
              {typeof item.value === "number" ? formatNumber(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 shadow-xl">
      <div className="mb-1 text-xs font-medium text-[#e6edf3]">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${item.name}-${item.value}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color ?? "#3fb950" }}
            />
            <span className="text-[#8b949e]">{item.name}</span>
            <span className="font-mono text-[#e6edf3]">
              {typeof item.value === "number" ? formatCurrency(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectMailProcessGraph() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold text-[#e6edf3]">Whole Loop: Target → Revenue</h2>
          <p className="mt-1 text-xs text-[#8b949e]">
            This is the actual direct-mail operating chain, not a lonely postcard scoreboard.
          </p>
        </div>
        <span className="rounded-full border border-[#d29922]/30 bg-[#d29922]/10 px-3 py-1 text-xs text-[#d29922]">
          Read-only attribution run · Aug 18
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {DIRECT_MAIL_PROCESS_STEPS.map((step, index) => (
          <div key={step.step} className="relative rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            {index < DIRECT_MAIL_PROCESS_STEPS.length - 1 ? (
              <div className="absolute right-[-14px] top-1/2 z-10 hidden h-px w-7 bg-[#30363d] lg:block" />
            ) : null}
            <div className="text-xs uppercase tracking-wide text-[#8b949e]">{step.step}</div>
            <div className="mt-2 text-lg font-semibold text-[#e6edf3]">{step.metric}</div>
            <div className="mt-2 text-xs leading-5 text-[#8b949e]">{step.detail}</div>
            <div className="mt-3 inline-flex rounded-full border border-[#30363d] px-2 py-1 text-[11px] text-[#58a6ff]">
              {step.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectMailPerformanceCharts() {
  const chartData = DIRECT_MAIL_PERFORMANCE.map((campaign) => ({
    ...campaign,
    shortName: campaign.name.replace("Carriage ", "Car. ").replace("Hunter's ", "Hun. "),
    responseRate: campaign.targetCount > 0 ? (campaign.matchedContacts / campaign.targetCount) * 100 : 0,
    returnMultiple: campaign.costAllocated > 0 ? campaign.matchedRevenue / campaign.costAllocated : 0,
  }));

  const funnelData = [
    { stage: "Targets", count: 1418 },
    { stage: "Matched Contacts", count: 11 },
    { stage: "Matched Jobs", count: 16 },
    { stage: "Sold Jobs", count: 2 },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h2 className="font-semibold text-[#e6edf3]">Attribution Funnel</h2>
        <p className="mt-1 text-xs text-[#8b949e]">
          Loaded campaign rows down to matched revenue proof. This makes drop-off visible.
        </p>
        <div className="mt-5 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid stroke="#30363d" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {funnelData.map((entry, index) => (
                  <Cell key={entry.stage} fill={campaignColors[index % campaignColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h2 className="font-semibold text-[#e6edf3]">Revenue vs Spend by Campaign</h2>
        <p className="mt-1 text-xs text-[#8b949e]">
          Shows where money came back, and where the mailbox goblin is still just eating postage.
        </p>
        <div className="mt-5 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid stroke="#30363d" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortName" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(63,185,80,0.08)" }} />
              <Bar dataKey="matchedRevenue" name="Matched revenue" radius={[4, 4, 0, 0]} fill="#3fb950" />
              <Bar dataKey="costAllocated" name="Allocated cost" radius={[4, 4, 0, 0]} fill="#d29922" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h2 className="font-semibold text-[#e6edf3]">Response Rate by Neighborhood</h2>
        <p className="mt-1 text-xs text-[#8b949e]">
          Matched contacts divided by campaign target count. Good roofing direct mail usually wants this above 2%.
        </p>
        <div className="mt-5 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 15, bottom: 20, left: 0 }}>
              <CartesianGrid stroke="#30363d" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortName" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 shadow-xl">
                      <div className="text-xs font-medium text-[#e6edf3]">{label}</div>
                      <div className="mt-1 text-xs text-[#8b949e]">
                        Response rate: <span className="font-mono text-[#e6edf3]">{typeof value === "number" ? formatPercent(value) : value}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="responseRate" name="Response rate" stroke="#58a6ff" strokeWidth={3} dot={{ r: 4, fill: "#58a6ff" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h2 className="font-semibold text-[#e6edf3]">Campaign Economics</h2>
        <p className="mt-1 text-xs text-[#8b949e]">
          Cost per matched lead and return multiple. Pending values mean no sold job or no matched lead yet.
        </p>
        <div className="mt-4 space-y-3">
          {DIRECT_MAIL_PERFORMANCE.map((campaign: DirectMailPerformanceCell) => {
            const returnMultiple = campaign.costAllocated > 0 ? campaign.matchedRevenue / campaign.costAllocated : 0;
            return (
              <div key={campaign.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#e6edf3]">{campaign.name}</div>
                    <div className="mt-1 text-xs text-[#8b949e]">{campaign.attributionNotes}</div>
                  </div>
                  <div className="text-right font-mono text-sm text-[#3fb950]">
                    {returnMultiple > 0 ? `${returnMultiple.toFixed(1)}x` : "Pending"}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[#8b949e]">Cost / lead</div>
                    <div className="font-mono text-[#e6edf3]">{campaign.costPerMatchedLead === null ? "Pending" : formatCurrency(campaign.costPerMatchedLead)}</div>
                  </div>
                  <div>
                    <div className="text-[#8b949e]">Sold jobs</div>
                    <div className="font-mono text-[#e6edf3]">{campaign.matchedSoldJobs}</div>
                  </div>
                  <div>
                    <div className="text-[#8b949e]">ROI</div>
                    <div className="font-mono text-[#e6edf3]">{formatPercent(campaign.roiPercent)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DirectMailPage() {
  const summary = getDirectMailSummary();
  const performanceSummary = getDirectMailPerformanceSummary();
  const [selectedId, setSelectedId] = useState(DIRECT_MAIL_CAMPAIGNS[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const selectedCampaign =
    DIRECT_MAIL_CAMPAIGNS.find((campaign) => campaign.id === selectedId) ??
    DIRECT_MAIL_CAMPAIGNS[0];

  const filteredCampaigns = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return DIRECT_MAIL_CAMPAIGNS;
    return DIRECT_MAIL_CAMPAIGNS.filter((campaign) =>
      [campaign.name, campaign.city, campaign.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  const largestCampaign = useMemo(
    () =>
      [...DIRECT_MAIL_CAMPAIGNS].sort((a, b) => b.usableRows - a.usableRows)[0],
    []
  );

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#58a6ff]">
            <Mail className="h-4 w-4" />
            Direct Mail Operating System
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#e6edf3]">
            Direct Mail Loop
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b949e]">
            Team-facing view of the full direct mail process: target lists, mailhouse
            handoff, cost, call/source attribution, matched jobs, sold revenue, and
            which campaign cells still need final postal-drop confirmation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={DIRECT_MAIL_BATCH.googleSheetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] hover:bg-[#21262d]"
          >
            Google Sheet
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={DIRECT_MAIL_BATCH.googleFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] hover:bg-[#21262d]"
          >
            Drive Folder
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard
          label="Campaign cells"
          value={formatNumber(summary.totalCampaigns)}
          detail="Neighborhood tabs in the Google Sheet"
          icon={Layers}
        />
        <StatCard
          label="Sheet rows"
          value={formatNumber(summary.totalSheetRows)}
          detail="Rows found across campaign tabs"
          icon={Mail}
        />
        <StatCard
          label="Usable recipients"
          value={formatNumber(summary.totalUsableRows)}
          detail="After excluding known malformed rows"
          icon={CheckCircle2}
        />
        <StatCard
          label="Sent to Mail Works"
          value={formatNumber(summary.sentToMailhouse)}
          detail="Campaign cells with recorded handoff times"
          icon={Printer}
        />
        <StatCard
          label="Need postal date"
          value={formatNumber(summary.pendingRon)}
          detail="Waiting on final mailhouse confirmation"
          icon={Clock3}
        />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard
          label="Matched targets"
          value={formatNumber(performanceSummary.totalTargets)}
          detail="Campaign rows in the current scorecard"
          icon={MapPin}
        />
        <StatCard
          label="Matched contacts"
          value={formatNumber(performanceSummary.totalMatchedContacts)}
          detail={`${formatPercent(performanceSummary.responseRate)} response rate`}
          icon={RadioTower}
        />
        <StatCard
          label="Matched jobs"
          value={formatNumber(performanceSummary.totalMatchedJobs)}
          detail={`${formatNumber(performanceSummary.totalSoldJobs)} sold jobs attributed`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Matched revenue"
          value={formatCurrency(performanceSummary.totalRevenue)}
          detail={`${performanceSummary.returnMultiple.toFixed(1)}x return on known spend`}
          icon={BarChart3Icon}
        />
        <StatCard
          label="Known spend"
          value={formatCurrency(performanceSummary.totalCost)}
          detail="Loaded Mail Works cost allocation"
          icon={Printer}
        />
      </div>

      <div className="mb-8">
        <DirectMailProcessGraph />
      </div>

      <div className="mb-8">
        <DirectMailPerformanceCharts />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <CampaignMap selectedId={selectedCampaign.id} onSelect={setSelectedId} />
        <CampaignDetail campaign={selectedCampaign} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg">
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[#e6edf3]">Campaign Queue</h2>
              <p className="mt-1 text-xs text-[#8b949e]">
                Subject lines should match these campaign names while you send Ron each PDF and CSV.
              </p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter campaigns"
              className="h-9 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#e6edf3] placeholder:text-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#58a6ff]"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[#8b949e]">
                <tr className="border-b border-[#30363d]">
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 text-right font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Sent to Mail Works</th>
                  <th className="px-4 py-3 font-medium">Postal Drop</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    onClick={() => setSelectedId(campaign.id)}
                    className={cn(
                      "cursor-pointer border-b border-[#30363d]/70 transition-colors hover:bg-[#21262d]/60",
                      selectedCampaign.id === campaign.id && "bg-[#58a6ff]/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#e6edf3]">
                        {campaign.name}
                      </div>
                      <div className="mt-1 text-xs text-[#8b949e]">
                        {campaign.sourceSheetTab}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#8b949e]">{campaign.city}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#e6edf3]">
                      {formatNumber(campaign.usableRows)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#e6edf3]">
                      {formatDateTime(campaign.sentToRonAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#8b949e]">
                      {formatDate(campaign.confirmedSentAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={campaign.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <h2 className="font-semibold text-[#e6edf3]">Build Sequence</h2>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Now", "Send each PDF and CSV to Ron using the campaign tab name."],
                ["Next", "Record Ron confirmation: final count, mail date, cost if available."],
                ["Then", "Sync confirmed campaigns into marketing_campaigns and mailer_addresses."],
                ["Later", "Overlay calls, forms, JobNimbus matches, and resend due dates."],
              ].map(([label, detail]) => (
                <div key={label} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#58a6ff]" />
                  <div>
                    <div className="font-medium text-[#e6edf3]">{label}</div>
                    <div className="text-[#8b949e]">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div className="flex items-center gap-2 text-[#d29922]">
              <AlertTriangle className="h-4 w-4" />
              <h2 className="font-semibold">Precision Boundary</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#8b949e]">
              This first map shows campaign cells, not exact property dots. The
              Google Sheet has mailing addresses but no latitude/longitude yet.
              Exact property markers require a geocoding pass or a PropStream
              export that includes coordinates.
            </p>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div className="flex items-center gap-2 text-[#3fb950]">
              <MousePointer2 className="h-4 w-4" />
              <h2 className="font-semibold">Largest Cell</h2>
            </div>
            <p className="mt-3 text-sm text-[#8b949e]">
              {largestCampaign.name} has{" "}
              <span className="font-mono text-[#e6edf3]">
                {formatNumber(largestCampaign.usableRows)}
              </span>{" "}
              usable recipients. It should be reviewed first when response data starts coming in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
