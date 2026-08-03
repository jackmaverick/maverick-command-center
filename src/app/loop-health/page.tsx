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
  Radio,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type { LoopStatus } from "@/lib/loop-registry";

type LoopProof = {
  label: string;
  kind: "file" | "directory" | "git" | "snapshot";
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
  nextAction: string;
  approvalRequired: boolean;
  cadence: string;
  healthSource: "supabase-snapshot" | "local-proof";
  snapshotCheckedAt: string | null;
  proofs: LoopProof[];
};

type LoopHealthResponse = {
  generatedAt: string;
  mode: "live-health" | "read-only";
  dataSources: {
    supabaseSnapshots: boolean;
    localProofFallback: boolean;
  };
  summary: Record<LoopStatus, number> & { total: number; approvalRequired: number };
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
  const isLive = loop.healthSource === "supabase-snapshot";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        isLive
          ? "border-[#238636] bg-[#0f2d1c] text-[#3fb950]"
          : "border-[#30363d] bg-[#21262d] text-[#8b949e]"
      }`}
    >
      <Radio className="h-3.5 w-3.5" />
      {isLive ? "Live snapshot" : "Local fallback"}
    </span>
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
    const order: Record<LoopStatus, number> = { failing: 0, warning: 1, unknown: 2, healthy: 3 };
    return [...data.loops].sort((a, b) => order[a.status] - order[b.status]);
  }, [data]);

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

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <SummaryTile label="Loops" value={data.summary.total} />
        <SummaryTile label="Healthy" value={data.summary.healthy} status="healthy" />
        <SummaryTile label="Warning" value={data.summary.warning} status="warning" />
        <SummaryTile label="Failing" value={data.summary.failing} status="failing" />
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

      {data.dataSources.supabaseSnapshots ? (
        <div className="mb-8 rounded-lg border border-[#238636] bg-[#0f2d1c] p-4">
          <div className="flex items-start gap-3">
            <Radio className="mt-0.5 h-5 w-5 shrink-0 text-[#3fb950]" />
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">Live snapshot mode</h2>
              <p className="mt-1 text-sm text-[#9be9a8]">
                At least one loop is backed by a published Supabase health snapshot. Loops without snapshots still
                use local proof fallback and should be instrumented next.
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
                <p className="text-[#8b949e]">Last run</p>
                <p className="font-mono text-[#e6edf3]">{loop.lastRun}</p>
              </div>
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
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[#30363d] text-xs text-[#8b949e]">
              <tr>
                <th className="py-3 pr-4 font-medium">Loop</th>
                <th className="py-3 pr-4 font-medium">Promise</th>
                <th className="py-3 pr-4 font-medium">Owner</th>
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
