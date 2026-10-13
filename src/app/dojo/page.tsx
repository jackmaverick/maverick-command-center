import "server-only";

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  PauseCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type HealthStatus = "healthy" | "stale" | "failing" | "paused" | "unknown";

type AutomationRow = {
  id: string;
  name: string;
  kind: string | null;
  owner_bot: string | null;
  lifecycle: string | null;
  retire_candidate: boolean;
  health: string | null;
  reason: string | null;
  checked_at: Date | string | null;
};

const STATUS_ORDER: HealthStatus[] = [
  "healthy",
  "stale",
  "failing",
  "paused",
  "unknown",
];

const STATUS_STYLE: Record<
  HealthStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    text: string;
    border: string;
    background: string;
    dot: string;
  }
> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    text: "text-[#3fb950]",
    border: "border-[#238636]",
    background: "bg-[#0f2d1c]",
    dot: "bg-[#3fb950]",
  },
  stale: {
    label: "Stale",
    icon: Clock3,
    text: "text-[#f0883e]",
    border: "border-[#bd561d]",
    background: "bg-[#2d1f0f]",
    dot: "bg-[#f0883e]",
  },
  failing: {
    label: "Failing",
    icon: XCircle,
    text: "text-[#f85149]",
    border: "border-[#da3633]",
    background: "bg-[#2d1515]",
    dot: "bg-[#f85149]",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    text: "text-[#a371f7]",
    border: "border-[#8957e5]",
    background: "bg-[#241a35]",
    dot: "bg-[#a371f7]",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    text: "text-[#8b949e]",
    border: "border-[#30363d]",
    background: "bg-[#21262d]",
    dot: "bg-[#8b949e]",
  },
};

function getHealthStatus(automation: AutomationRow): HealthStatus {
  if (automation.lifecycle?.toLowerCase() === "paused") return "paused";

  const health = automation.health?.toLowerCase();
  return STATUS_ORDER.includes(health as HealthStatus)
    ? (health as HealthStatus)
    : "unknown";
}

function formatCheckedAt(value: AutomationRow["checked_at"]): string {
  if (!value) return "No check recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown check time";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.background} ${style.border} ${style.text}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}

export default async function DojoPage() {
  const automations = await query<AutomationRow>(
    `SELECT
       id,
       name,
       kind,
       owner_bot,
       lifecycle,
       retire_candidate,
       health,
       reason,
       checked_at
     FROM public.v_automation_dojo
     ORDER BY retire_candidate DESC, name ASC`,
  );

  const healthCounts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, 0]),
  ) as Record<HealthStatus, number>;

  for (const automation of automations) {
    healthCounts[getHealthStatus(automation)] += 1;
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">
            Automation Dojo
          </h1>
          <p className="max-w-3xl text-[#8b949e]">
            Read-only inventory and latest health checks for Maverick
            automations.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
          <ShieldCheck className="h-4 w-4 text-[#3fb950]" aria-hidden="true" />
          Read only
        </span>
      </div>

      <section aria-label="Automation health summary" className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STATUS_ORDER.map((status) => {
            const style = STATUS_STYLE[status];
            const Icon = style.icon;

            return (
              <div
                key={status}
                className={`rounded-lg border p-4 ${style.border} ${style.background}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 ${style.text}`}
                    aria-hidden="true"
                  />
                  <p className="text-xs text-[#8b949e]">{style.label}</p>
                </div>
                <p className={`text-2xl font-bold ${style.text}`}>
                  {healthCounts[status]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {automations.length === 0 ? (
        <div className="rounded-lg border border-[#9e6a03] bg-[#2d220f] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-[#d29922]"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold text-[#e6edf3]">
                No automations found
              </h2>
              <p className="mt-1 text-sm text-[#d29922]">
                The automation dojo view returned no records.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <section
          aria-label={`${automations.length} automations`}
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
        >
          {automations.map((automation) => {
            const status = getHealthStatus(automation);
            const statusStyle = STATUS_STYLE[status];

            return (
              <article
                key={automation.id}
                className="rounded-lg border border-[#30363d] bg-[#161b22] p-5"
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-lg font-semibold text-[#e6edf3]">
                        {automation.name}
                      </h2>
                      {automation.retire_candidate ? (
                        <span className="rounded-full border border-[#9e6a03] bg-[#2d220f] px-2.5 py-1 text-xs font-medium text-[#d29922]">
                          Retire candidate
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-[#8b949e]">
                      {automation.kind ?? "Unknown kind"}
                    </p>
                  </div>
                  <HealthBadge status={status} />
                </div>

                <dl className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-[#8b949e]">Owner</dt>
                    <dd className="mt-1 text-sm text-[#e6edf3]">
                      {automation.owner_bot ?? "Unassigned"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#8b949e]">Lifecycle</dt>
                    <dd className="mt-1 text-sm capitalize text-[#e6edf3]">
                      {automation.lifecycle ?? "Unknown"}
                    </dd>
                  </div>
                </dl>

                <div
                  className={`rounded-md border p-3 ${statusStyle.border} ${statusStyle.background}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-xs font-semibold ${statusStyle.text}`}>
                      Latest check
                    </p>
                    <time className="font-mono text-xs text-[#8b949e]">
                      {formatCheckedAt(automation.checked_at)}
                    </time>
                  </div>
                  {automation.reason ? (
                    <p className="mt-2 text-sm text-[#c9d1d9]">
                      {automation.reason}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
