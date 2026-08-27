"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileSearch,
  FolderGit2,
  ListChecks,
  GitMerge,
  Network,
  PauseCircle,
  Radio,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type { LoopStatus } from "@/lib/loop-registry";

type LoopProof = {
  label: string;
  kind: "file" | "directory" | "git" | "snapshot" | "runtime";
  path: string;
  available: boolean;
  checkedAt: string;
  modifiedAt: string | null;
  ageHours: number | null;
  status: LoopStatus;
  summary: string;
  evidence: string | null;
};

type LoopHealthEntry = {
  id: string;
  name: string;
  businessPromise: string;
  owner: string;
  sourceRepoPath: string;
  actionSurface: {
    name: string;
    purpose: string;
    pathOrUrl: string;
    actions: string[];
  };
  codexProject: {
    projectName: string;
    mode: "Local";
    folder: string;
    repo: string;
    branch: string;
    starterPrompt: string;
  };
  lastRun: string;
  lastProof: string;
  status: LoopStatus;
  reportedStatus: LoopStatus | null;
  monitorStatus: "healthy" | "warning" | "failing" | "paused" | "unknown";
  healthReason: string;
  nextAction: string;
  approvalRequired: boolean;
  cadence: string;
  healthSource: "graph-monitor" | "supabase-snapshot" | "local-proof";
  snapshotCheckedAt: string | null;
  lastObservedAt: string | null;
  freshness: {
    snapshotAgeHours: number | null;
    runAgeHours: number | null;
    maxSnapshotAgeHours: number | null;
    maxRunAgeHours: number | null;
  };
  graph: {
    family: string;
    familyLabel: string;
    stage: string;
    dependsOn: string[];
    simplification: {
      action: "keep" | "merge" | "split" | "retire" | "move";
      target: string;
      reason: string;
    };
  };
  blockedBy: Array<{ id: string; name: string; status: LoopStatus }>;
  runtimeSignals: Array<{
    source: string;
    loopName: string;
    status: "ok" | "red" | "paused" | "stale" | "unknown";
    detail: string;
    lastRunAt: string | null;
    schedule: string | null;
    snapshotAt: string;
    label?: string;
  }>;
  proofs: LoopProof[];
};

type LoopHealthResponse = {
  generatedAt: string;
  mode: "live-health" | "read-only";
  dataSources: {
    supabaseSnapshots: boolean;
    runtimeWatchdog: boolean;
    runtimeCheckedAt: string | null;
    localProofFallback: boolean;
  };
  summary: Record<LoopStatus, number> & { total: number; approvalRequired: number };
  graph: {
    families: Array<{
      id: string;
      label: string;
      promise: string;
      recommendation: string;
      targetShape: string;
      status: LoopStatus;
      loopIds: string[];
    }>;
  };
  loops: LoopHealthEntry[];
};

const STATUS_STYLE: Record<
  LoopStatus,
  { label: string; icon: typeof CheckCircle2; text: string; bg: string; border: string; dot: string }
> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    text: "text-[#3fb950]",
    bg: "bg-[#0f2d1c]",
    border: "border-[#238636]",
    dot: "bg-[#3fb950]",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    text: "text-[#d29922]",
    bg: "bg-[#2d220f]",
    border: "border-[#9e6a03]",
    dot: "bg-[#d29922]",
  },
  failing: {
    label: "Failing",
    icon: XCircle,
    text: "text-[#f85149]",
    bg: "bg-[#2d1515]",
    border: "border-[#da3633]",
    dot: "bg-[#f85149]",
  },
  stale: {
    label: "Stale",
    icon: Clock3,
    text: "text-[#f0883e]",
    bg: "bg-[#2d1f0f]",
    border: "border-[#bd561d]",
    dot: "bg-[#f0883e]",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    text: "text-[#a371f7]",
    bg: "bg-[#241a35]",
    border: "border-[#8957e5]",
    dot: "bg-[#a371f7]",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    text: "text-[#8b949e]",
    bg: "bg-[#21262d]",
    border: "border-[#30363d]",
    dot: "bg-[#8b949e]",
  },
};

function StatusBadge({ status }: { status: LoopStatus }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.border} ${style.text}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAge(hours: number | null) {
  if (hours === null) return "Unknown age";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min old`;
  if (hours < 48) return `${Math.round(hours)} hr old`;
  return `${Math.round(hours / 24)} days old`;
}

function shortPath(value: string) {
  return value.replace("/Users/maverick_ai/", "~/");
}

function SummaryTile({
  label,
  value,
  status,
}: {
  label: string;
  value: number | string;
  status?: LoopStatus;
}) {
  const tone = status ? STATUS_STYLE[status].text : "text-[#e6edf3]";

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
      <p className="mb-1 text-xs text-[#8b949e]">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function ProofRow({ proof }: { proof: LoopProof }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-[#e6edf3]">{proof.label}</p>
            <StatusBadge status={proof.status} />
          </div>
          <p className="mt-1 break-all font-mono text-xs text-[#8b949e]">{shortPath(proof.path)}</p>
        </div>
        <p className="shrink-0 font-mono text-xs text-[#8b949e]">{formatAge(proof.ageHours)}</p>
      </div>
      <p className="mt-2 text-xs text-[#8b949e]">{proof.summary}</p>
      {proof.evidence ? (
        <p className="mt-2 line-clamp-2 text-xs text-[#c9d1d9]">{proof.evidence}</p>
      ) : null}
    </div>
  );
}

function SourceBadge({ loop }: { loop: LoopHealthEntry }) {
  const isGraph = loop.healthSource === "graph-monitor";
  const isSnapshot = loop.healthSource === "supabase-snapshot";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        isGraph
          ? "border-[#1f6feb] bg-[#0d2442] text-[#58a6ff]"
          : isSnapshot
          ? "border-[#238636] bg-[#0f2d1c] text-[#3fb950]"
          : "border-[#30363d] bg-[#21262d] text-[#8b949e]"
      }`}
    >
      {isGraph ? <Network className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
      {isGraph ? "Graph monitored" : isSnapshot ? "Snapshot only" : "Local fallback"}
    </span>
  );
}

function ActionSurfacePanel({ loop }: { loop: LoopHealthEntry }) {
  return (
    <div className="mb-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[#d29922]" />
        <p className="text-sm font-medium text-[#e6edf3]">Action surface</p>
      </div>
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-[#8b949e]">Where the work happens</p>
          <p className="mt-1 text-[#e6edf3]">{loop.actionSurface.name}</p>
        </div>
        <div>
          <p className="text-[#8b949e]">Allowed actions</p>
          <p className="mt-1 text-[#e6edf3]">{loop.actionSurface.actions.join(" / ")}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-[#8b949e]">Path or URL</p>
          <p className="mt-1 break-all font-mono text-[#e6edf3]">
            {shortPath(loop.actionSurface.pathOrUrl)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#8b949e]">{loop.actionSurface.purpose}</p>
    </div>
  );
}

function CodexProjectPanel({ loop }: { loop: LoopHealthEntry }) {
  return (
    <div className="mb-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
      <div className="mb-3 flex items-center gap-2">
        <FolderGit2 className="h-4 w-4 text-[#58a6ff]" />
        <p className="text-sm font-medium text-[#e6edf3]">Codex project</p>
      </div>
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-[#8b949e]">Project</p>
          <p className="mt-1 text-[#e6edf3]">{loop.codexProject.projectName}</p>
        </div>
        <div>
          <p className="text-[#8b949e]">Repo / branch</p>
          <p className="mt-1 font-mono text-[#e6edf3]">
            {loop.codexProject.repo} · {loop.codexProject.branch}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-[#8b949e]">Folder to choose in Codex</p>
          <p className="mt-1 break-all font-mono text-[#e6edf3]">
            {shortPath(loop.codexProject.folder)}
          </p>
        </div>
      </div>
      <details className="mt-3 rounded-md border border-[#30363d] bg-[#161b22] p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#c9d1d9]">
          <TerminalSquare className="h-4 w-4 text-[#8b949e]" />
          Starter prompt
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[#8b949e]">
          {loop.codexProject.starterPrompt}
        </pre>
      </details>
    </div>
  );
}

function GraphFamilyPanel({
  family,
  loops,
}: {
  family: LoopHealthResponse["graph"]["families"][number];
  loops: LoopHealthEntry[];
}) {
  return (
    <article className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-[#58a6ff]" />
            <h3 className="font-semibold text-[#e6edf3]">{family.label}</h3>
          </div>
          <p className="mt-2 text-xs text-[#8b949e]">{family.promise}</p>
        </div>
        <StatusBadge status={family.status} />
      </div>
      <div className="space-y-2">
        {loops.map((loop, index) => (
          <div key={loop.id} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-center font-mono text-[#484f58]">{index === 0 ? "●" : "↓"}</span>
            <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[loop.status].dot}`} />
            <span className="text-[#c9d1d9]">{loop.graph.stage}</span>
            <span className="ml-auto text-[#8b949e]">{STATUS_STYLE[loop.status].label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-[#1f6feb] bg-[#0d2442] p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[#58a6ff]">
          <GitMerge className="h-4 w-4" />
          {family.targetShape}
        </div>
        <p className="mt-2 text-xs leading-5 text-[#a5d6ff]">{family.recommendation}</p>
      </div>
    </article>
  );
}

function SimplificationPanel({ loop }: { loop: LoopHealthEntry }) {
  const recommendation = loop.graph.simplification;
  return (
    <div className="mb-4 rounded-md border border-[#1f6feb] bg-[#0d2442] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge className="h-4 w-4 text-[#58a6ff]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
          Simplify: {recommendation.action}
        </p>
        <span className="text-xs text-[#a5d6ff]">→ {recommendation.target}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#a5d6ff]">{recommendation.reason}</p>
    </div>
  );
}

export default function LoopHealthPage() {
  const { data, isLoading, error } = useQuery<LoopHealthResponse>({
    queryKey: ["loop-health"],
    queryFn: async () => {
      const res = await fetch("/api/loop-health");
      if (!res.ok && res.status !== 207) throw new Error("Failed to fetch loop health");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const sortedLoops = useMemo(() => {
    if (!data) return [];
    const order: Record<LoopStatus, number> = {
      failing: 0,
      stale: 1,
      warning: 2,
      unknown: 3,
      paused: 4,
      healthy: 5,
    };
    return [...data.loops].sort((a, b) => order[a.status] - order[b.status]);
  }, [data]);

  const loopsById = useMemo(() => new Map(data?.loops.map((loop) => [loop.id, loop]) ?? []), [data]);

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Loop Health Cockpit</h1>
        <p className="text-[#8b949e]">Reading loop registry and local proof artifacts...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Loop Health Cockpit</h1>
        <p className="text-[#f85149]">Failed to load loop health data.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Loop Health Cockpit</h1>
          <p className="max-w-3xl text-[#8b949e]">
            Live health board for Maverick automations, agents, and local worktrees. Actions remain approval-gated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
            <ShieldCheck className="h-4 w-4 text-[#3fb950]" />
            {data.mode}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
            <Clock3 className="h-4 w-4" />
            {formatGeneratedAt(data.generatedAt)} CT
          </span>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-8">
        <SummaryTile label="Loops" value={data.summary.total} />
        <SummaryTile label="Healthy" value={data.summary.healthy} status="healthy" />
        <SummaryTile label="Warning" value={data.summary.warning} status="warning" />
        <SummaryTile label="Failing" value={data.summary.failing} status="failing" />
        <SummaryTile label="Stale" value={data.summary.stale} status="stale" />
        <SummaryTile label="Paused" value={data.summary.paused} status="paused" />
        <SummaryTile label="Unknown" value={data.summary.unknown} status="unknown" />
        <SummaryTile label="Approval-gated" value={data.summary.approvalRequired} />
      </div>

      {data.summary.total > 0 && data.summary.unknown === data.summary.total ? (
        <div className="mb-8 rounded-lg border border-[#9e6a03] bg-[#2d220f] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#d29922]" />
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">Remote preview mode</h2>
              <p className="mt-1 text-sm text-[#d29922]">
                This deployment has no live snapshots yet and cannot read local Maverick proof files under
                <span className="font-mono"> /Users/maverick_ai</span>. Run the local snapshot publisher to make the
                production page show current loop health.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data.dataSources.runtimeWatchdog ? (
        <div className="mb-8 rounded-lg border border-[#1f6feb] bg-[#0d2442] p-4">
          <div className="flex items-start gap-3">
            <Network className="mt-0.5 h-5 w-5 shrink-0 text-[#58a6ff]" />
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">Graph monitor connected</h2>
              <p className="mt-1 text-sm text-[#a5d6ff]">
                Scheduler health was checked {data.dataSources.runtimeCheckedAt ? formatGeneratedAt(data.dataSources.runtimeCheckedAt) : "recently"} CT.
                A green badge now requires fresh business proof; a scheduler-only success cannot turn stale evidence green.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Network className="h-5 w-5 text-[#58a6ff]" />
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">Business loop graph</h2>
            <p className="text-sm text-[#8b949e]">
              Families show how shared sources, runtimes, actions, and outcomes should collapse into fewer top-level loops.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.graph.families.map((family) => (
            <GraphFamilyPanel
              key={family.id}
              family={family}
              loops={family.loopIds.flatMap((id) => {
                const loop = loopsById.get(id);
                return loop ? [loop] : [];
              })}
            />
          ))}
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sortedLoops.map((loop) => (
          <article key={loop.id} className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-[#e6edf3]">{loop.name}</h2>
                  <StatusBadge status={loop.status} />
                  <SourceBadge loop={loop} />
                </div>
                <p className="text-sm text-[#8b949e]">{loop.businessPromise}</p>
              </div>
              <div className="shrink-0 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs">
                <p className="text-[#8b949e]">Last proven run</p>
                <p className="font-mono text-[#e6edf3]">{loop.lastRun}</p>
                <p className="mt-1 font-mono text-[#8b949e]">{formatAge(loop.freshness.runAgeHours)}</p>
              </div>
            </div>

            <div className={`mb-4 rounded-md border p-3 ${STATUS_STYLE[loop.status].border} ${STATUS_STYLE[loop.status].bg}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-semibold ${STATUS_STYLE[loop.status].text}`}>Why this status</p>
                <span className="text-xs text-[#8b949e]">Monitor: {loop.monitorStatus}</span>
                {loop.reportedStatus && loop.reportedStatus !== loop.status ? (
                  <span className="text-xs text-[#8b949e]">
                    Stored result: {loop.reportedStatus} (overridden)
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-[#e6edf3]">{loop.healthReason}</p>
              {loop.blockedBy.length > 0 ? (
                <p className="mt-2 text-xs text-[#d29922]">
                  Upstream: {loop.blockedBy.map((dependency) => `${dependency.name} (${dependency.status})`).join(" · ")}
                </p>
              ) : null}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[#8b949e]">Owner</p>
                <p className="text-sm text-[#e6edf3]">{loop.owner}</p>
              </div>
              <div>
                <p className="text-xs text-[#8b949e]">Cadence</p>
                <p className="text-sm capitalize text-[#e6edf3]">{loop.cadence}</p>
              </div>
              <div>
                <p className="text-xs text-[#8b949e]">Approval</p>
                <p className="text-sm text-[#e6edf3]">{loop.approvalRequired ? "Required" : "Not required"}</p>
              </div>
            </div>

            <div className="mb-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
              <p className="mb-1 text-xs text-[#8b949e]">Next action</p>
              <p className="text-sm text-[#e6edf3]">{loop.nextAction}</p>
            </div>

            <ActionSurfacePanel loop={loop} />

            <SimplificationPanel loop={loop} />

            <div className="mb-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
              <p className="mb-1 text-xs text-[#8b949e]">Make healthy</p>
              <p className="text-sm text-[#e6edf3]">
                Work this loop in {loop.codexProject.projectName}, verify the latest proof, then publish a fresh
                health snapshot. Approval-gated loops still require Jack approval before any live customer action.
              </p>
            </div>

            <CodexProjectPanel loop={loop} />

            <div className="mb-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
              <p className="mb-1 text-xs text-[#8b949e]">Last proof</p>
              <p className="text-sm text-[#e6edf3]">{loop.lastProof}</p>
            </div>

            <div className="space-y-2">
              {loop.proofs.map((proof) => (
                <ProofRow key={`${loop.id}-${proof.label}`} proof={proof} />
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-[#58a6ff]" />
          <h2 className="text-lg font-semibold text-[#e6edf3]">Registry</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-[#30363d] text-xs text-[#8b949e]">
              <tr>
                <th className="py-3 pr-4 font-medium">Loop</th>
                <th className="py-3 pr-4 font-medium">Promise</th>
                <th className="py-3 pr-4 font-medium">Owner</th>
                <th className="py-3 pr-4 font-medium">Action surface</th>
                <th className="py-3 pr-4 font-medium">Source</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Health source</th>
                <th className="py-3 pr-4 font-medium">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {data.loops.map((loop) => (
                <tr key={loop.id}>
                  <td className="py-3 pr-4 font-medium text-[#e6edf3]">{loop.name}</td>
                  <td className="max-w-sm py-3 pr-4 text-xs text-[#8b949e]">{loop.businessPromise}</td>
                  <td className="py-3 pr-4 text-xs text-[#c9d1d9]">{loop.owner}</td>
                  <td className="py-3 pr-4 text-xs text-[#c9d1d9]">
                    <p className="font-medium text-[#e6edf3]">{loop.actionSurface.name}</p>
                    <p className="mt-1 text-[#8b949e]">{loop.actionSurface.actions.join(" / ")}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-[#8b949e]">
                      {shortPath(loop.sourceRepoPath)}
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={loop.status} />
                  </td>
                  <td className="py-3 pr-4">
                    <SourceBadge loop={loop} />
                  </td>
                  <td className="py-3 pr-4 text-xs text-[#c9d1d9]">
                    {loop.approvalRequired ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
