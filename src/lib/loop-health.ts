import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { defaultFreshnessHours, loopFamilies, loopGraphById } from "@/lib/loop-graph";
import { evaluateLoopHealth, type MonitorStatus } from "@/lib/loop-health-evaluation";
import {
  fetchLatestLoopHealthSnapshots,
  fetchLatestLoopRuntimeSignals,
  type LoopHealthSnapshot,
  type LoopRuntimeSignal,
  type LoopRuntimeStatus,
} from "@/lib/loop-health-snapshots";
import { loopRegistry, type LoopRegistryEntry, type LoopStatus } from "@/lib/loop-registry";

const execFileAsync = promisify(execFile);

export interface LoopProof {
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
}

export interface LoopHealthEntry {
  id: string;
  name: string;
  businessPromise: string;
  owner: string;
  sourceRepoPath: string;
  actionSurface: LoopRegistryEntry["actionSurface"];
  codexProject: LoopCodexProject;
  lastRun: string;
  lastProof: string;
  status: LoopStatus;
  reportedStatus: LoopStatus | null;
  monitorStatus: MonitorStatus;
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
  runtimeSignals: LoopRuntimeSignal[];
  proofs: LoopProof[];
}

export interface LoopCodexProject {
  projectName: string;
  mode: "Local";
  folder: string;
  repo: string;
  branch: string;
  starterPrompt: string;
}

export interface LoopHealthResponse {
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
}

type FileCandidate = {
  filePath: string;
  modifiedAt: Date;
  text: string | null;
};

const ARTIFACT_NAME_HINTS = [
  "latest",
  "watchlist",
  "scorecard",
  "preview",
  "run",
  "dashboard",
  "collections-text-dry-run-preview",
  ".jsonl",
  ".json",
  ".md",
  ".html",
  ".txt",
  ".log",
];

function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function statusRank(status: LoopStatus): number {
  return { failing: 0, stale: 1, warning: 2, unknown: 3, paused: 4, healthy: 5 }[status];
}

function worstStatus(statuses: LoopStatus[]): LoopStatus {
  if (statuses.length === 0) return "unknown";
  return statuses.reduce((worst, status) =>
    statusRank(status) < statusRank(worst) ? status : worst
  );
}

function evidenceSnippet(text: string): string {
  const line =
    text
    .split(/\r?\n/)
    .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? "";

  return line.length > 320 ? `${line.slice(0, 320)}...` : line;
}

function containsAny(text: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  const haystack = text.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

async function readTextSafe(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

async function latestFileInDirectory(
  dirPath: string,
  nameIncludes: string[] = []
): Promise<FileCandidate | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) =>
          nameIncludes.length === 0 || nameIncludes.some((hint) => entry.name.includes(hint))
        )
        .filter((entry) => ARTIFACT_NAME_HINTS.some((hint) => entry.name.includes(hint)))
        .map(async (entry) => {
          const filePath = path.join(dirPath, entry.name);
          const stats = await fs.stat(filePath);
          return { filePath, modifiedAt: stats.mtime };
        })
    );

    const latest = files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())[0];
    if (!latest) return null;

    return {
      ...latest,
      text: await readTextSafe(latest.filePath),
    };
  } catch {
    return null;
  }
}

async function resolveFileProof(source: LoopRegistryEntry["proofSources"][number]): Promise<LoopProof> {
  const checkedAt = new Date().toISOString();
  const stats = await fs.stat(source.path).catch(() => null);

  if (!stats?.isFile()) {
    return {
      label: source.label,
      kind: source.kind,
      path: source.path,
      available: false,
      checkedAt,
      modifiedAt: null,
      ageHours: null,
      status: "unknown",
      summary: "Artifact not found on this machine.",
      evidence: null,
    };
  }

  const text = await readTextSafe(source.path);
  const ageHours = hoursSince(stats.mtime);
  const matchedFailure = containsAny(text ?? "", source.failurePatterns);
  const matchedSuccess = containsAny(text ?? "", source.successPatterns);
  const stale = source.freshnessHours ? ageHours > source.freshnessHours : false;
  const status: LoopStatus = matchedFailure
    ? "warning"
    : stale
      ? "stale"
      : matchedSuccess || !source.successPatterns?.length
        ? "healthy"
        : "unknown";

  return {
    label: source.label,
    kind: source.kind,
    path: source.path,
    available: true,
    checkedAt,
    modifiedAt: stats.mtime.toISOString(),
    ageHours,
    status,
    summary: matchedFailure
      ? "Potential failure marker found; structured runtime verification is required before calling the loop failed."
      : stale
        ? `Proof exists but is older than ${source.freshnessHours} hours.`
        : matchedSuccess
          ? "Success pattern found in proof."
          : "Proof file exists; no explicit success pattern matched.",
    evidence: text ? evidenceSnippet(text) : null,
  };
}

async function resolveDirectoryProof(source: LoopRegistryEntry["proofSources"][number]): Promise<LoopProof> {
  const checkedAt = new Date().toISOString();
  const latest = await latestFileInDirectory(source.path, source.nameIncludes);

  if (!latest) {
    return {
      label: source.label,
      kind: source.kind,
      path: source.path,
      available: false,
      checkedAt,
      modifiedAt: null,
      ageHours: null,
      status: "unknown",
      summary: "No matching artifact found in directory.",
      evidence: null,
    };
  }

  const ageHours = hoursSince(latest.modifiedAt);
  const text = latest.text ?? "";
  const matchedFailure = containsAny(text, source.failurePatterns);
  const matchedSuccess = containsAny(text, source.successPatterns);
  const stale = source.freshnessHours ? ageHours > source.freshnessHours : false;
  const status: LoopStatus = matchedFailure
    ? "warning"
    : stale
      ? "stale"
      : matchedSuccess || !source.successPatterns?.length
        ? "healthy"
        : "unknown";

  return {
    label: source.label,
    kind: source.kind,
    path: latest.filePath,
    available: true,
    checkedAt,
    modifiedAt: latest.modifiedAt.toISOString(),
    ageHours,
    status,
    summary: matchedFailure
      ? "Potential failure marker found; structured runtime verification is required before calling the loop failed."
      : stale
        ? `Latest artifact is older than ${source.freshnessHours} hours.`
        : matchedSuccess
          ? "Latest artifact contains expected loop evidence."
          : "Latest artifact exists; no explicit success pattern matched.",
    evidence: text ? evidenceSnippet(text) : path.basename(latest.filePath),
  };
}

async function resolveGitProof(source: LoopRegistryEntry["proofSources"][number]): Promise<LoopProof> {
  const checkedAt = new Date().toISOString();
  const stats = await fs.stat(source.path).catch(() => null);

  if (!stats?.isDirectory()) {
    return {
      label: source.label,
      kind: "git",
      path: source.path,
      available: false,
      checkedAt,
      modifiedAt: null,
      ageHours: null,
      status: "unknown",
      summary: "Git worktree path not found on this machine.",
      evidence: null,
    };
  }

  try {
    const [{ stdout: branch }, { stdout: remote }, { stdout: dirty }] =
      await Promise.all([
        execFileAsync("git", ["branch", "--show-current"], { cwd: source.path }),
        execFileAsync("git", ["remote", "get-url", "origin"], { cwd: source.path }),
        execFileAsync("git", ["status", "--porcelain=v1"], { cwd: source.path }),
      ]);
    const dirtyCount = dirty.split(/\r?\n/).filter(Boolean).length;
    const status: LoopStatus = dirtyCount === 0 ? "healthy" : "warning";

    return {
      label: source.label,
      kind: "git",
      path: source.path,
      available: true,
      checkedAt,
      modifiedAt: null,
      ageHours: null,
      status,
      summary:
        dirtyCount === 0
          ? "Clean git worktree."
          : `${dirtyCount} dirty file${dirtyCount === 1 ? "" : "s"} in git worktree.`,
      evidence: `${branch.trim() || "unknown branch"} | ${remote.trim() || "unknown remote"}`,
    };
  } catch (error) {
    return {
      label: source.label,
      kind: "git",
      path: source.path,
      available: true,
      checkedAt,
      modifiedAt: null,
      ageHours: null,
      status: "unknown",
      summary: error instanceof Error ? error.message : "Git status check failed.",
      evidence: null,
    };
  }
}

async function resolveProof(source: LoopRegistryEntry["proofSources"][number]): Promise<LoopProof> {
  if (source.kind === "git") return resolveGitProof(source);
  if (source.kind === "directory") return resolveDirectoryProof(source);
  return resolveFileProof(source);
}

function formatLastRun(proofs: LoopProof[]): string {
  const latest = proofs
    .filter((proof) => proof.modifiedAt)
    .sort((a, b) => new Date(b.modifiedAt!).getTime() - new Date(a.modifiedAt!).getTime())[0];

  if (!latest?.modifiedAt) return "Unknown";
  return new Date(latest.modifiedAt).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLastProof(proofs: LoopProof[]): string {
  const proof =
    proofs.find((item) => item.status === "failing") ??
    proofs.find((item) => item.status === "healthy") ??
    proofs.find((item) => item.available) ??
    proofs[0];

  if (!proof) return "No proof configured.";
  return `${proof.label}: ${proof.summary}`;
}

function codexProjectFor(entry: LoopRegistryEntry): LoopCodexProject {
  const isWebsiteLoop = entry.id.startsWith("website-");
  const isCommandCenterLoop = entry.id === "repo-worktree-health";
  const isProductionCommunicationLoop = entry.id === "production-communication-closed-loop";
  const folder = isWebsiteLoop
    ? "/Users/maverick_ai/worktrees/website-growth-loop"
    : isCommandCenterLoop
      ? "/Users/maverick_ai/worktrees/loop-health-cockpit"
      : isProductionCommunicationLoop
        ? "/Users/maverick_ai/supabase-maverick-exteriors"
      : "/Users/maverick_ai/worktrees/ops-automation-loop-fixes";
  const repo = isWebsiteLoop
    ? "jackmaverick/website"
    : isCommandCenterLoop
      ? "jackmaverick/maverick-command-center"
      : "jackmaverick/supabase-maverick-exteriors";
  const branch = isWebsiteLoop
    ? "codex/website-growth-loop"
    : isCommandCenterLoop
      ? "codex/loop-health-cockpit"
      : isProductionCommunicationLoop
        ? "codex/daily-production-check"
      : "codex/ops-automation-loop-fixes";

  return {
    projectName: isWebsiteLoop
      ? "Website Growth Loop"
      : isCommandCenterLoop
        ? "Loop Health Cockpit"
        : isProductionCommunicationLoop
          ? "Production Communication Graph"
        : "Ops Automation Loop Fixes",
    mode: "Local",
    folder,
    repo,
    branch,
    starterPrompt: [
      `We are working on the Maverick Loop Health row: ${entry.name}.`,
      `Start in ${folder}.`,
      "First confirm pwd, git remote, branch, and dirty file count.",
      `Expected repo: ${repo}. Expected branch/worktree: ${branch}.`,
      `Business promise: ${entry.businessPromise}`,
      `Human action surface: ${entry.actionSurface.name} (${entry.actionSurface.pathOrUrl}). Expected actions: ${entry.actionSurface.actions.join(", ")}.`,
      `Current next action: ${entry.nextAction}`,
      `Canonical source/proof path to inspect: ${entry.sourceRepoPath}`,
      "Do not send texts, emails, publish website changes, mutate JobNimbus/OpenPhone/Supabase, or deploy unless I explicitly approve it.",
      "Find the failing proof source first, explain what is actually broken, make the smallest safe fix, then rerun the relevant proof check.",
    ].join("\n"),
  };
}

function snapshotProof(snapshot: LoopHealthSnapshot, status: LoopStatus, summary: string): LoopProof {
  const checkedAt = snapshot.checkedAt;
  const modifiedAt = snapshot.ranAt ?? snapshot.checkedAt;
  const ageHours = hoursSince(new Date(modifiedAt));

  return {
    label: snapshot.proofLabel ?? "live health snapshot",
    kind: "snapshot",
    path: snapshot.proofPath ?? "loop_health_snapshots",
    available: true,
    checkedAt,
    modifiedAt,
    ageHours,
    status,
    summary,
    evidence: snapshot.proofEvidence,
  };
}

function runtimeProof(signal: LoopRuntimeSignal): LoopProof {
  const status: LoopStatus = ({
    ok: "healthy",
    red: "failing",
    paused: "paused",
    stale: "stale",
    unknown: "unknown",
  } satisfies Record<LoopRuntimeStatus, LoopStatus>)[signal.status];
  return {
    label: signal.label ?? signal.loopName,
    kind: "runtime",
    path: `${signal.source}:${signal.loopName}`,
    available: true,
    checkedAt: signal.snapshotAt,
    modifiedAt: signal.lastRunAt ?? signal.snapshotAt,
    ageHours: hoursSince(new Date(signal.lastRunAt ?? signal.snapshotAt)),
    status,
    summary: signal.detail,
    evidence: signal.schedule ? `Schedule: ${signal.schedule}` : signal.source,
  };
}

export async function buildLoopHealth(options: { includeSnapshots?: boolean } = {}): Promise<LoopHealthResponse> {
  const includeSnapshots = options.includeSnapshots ?? true;
  const [snapshots, runtimeSignalMap] = includeSnapshots
    ? await Promise.all([fetchLatestLoopHealthSnapshots(), fetchLatestLoopRuntimeSignals()])
    : [new Map<string, LoopHealthSnapshot>(), new Map<string, LoopRuntimeSignal>()];
  const loops = await Promise.all(
    loopRegistry.map(async (entry) => {
      const snapshot = snapshots.get(entry.id);
      const localProofs = snapshot ? [] : await Promise.all(entry.proofSources.map(resolveProof));
      const graph = loopGraphById.get(entry.id);
      const requiredRefs = graph?.runtimeSignals.filter((signal) => signal.required !== false) ?? [];
      const runtimeSignals = (graph?.runtimeSignals ?? []).flatMap((reference) => {
        const signal = runtimeSignalMap.get(`${reference.source}:${reference.loopName}`);
        return signal ? [{ ...signal, label: reference.label }] : [];
      });
      const requiredRuntimeSignals = requiredRefs.flatMap((reference) => {
        const signal = runtimeSignalMap.get(`${reference.source}:${reference.loopName}`);
        return signal ? [{ ...signal, label: reference.label }] : [];
      });
      const defaultFreshness = defaultFreshnessHours(entry.cadence);
      const maxSnapshotAgeHours = graph?.maxSnapshotAgeHours ?? defaultFreshness;
      const maxRunAgeHours = graph?.maxRunAgeHours ?? defaultFreshness;
      const localStatus = localProofs.length
        ? worstStatus(localProofs.map((proof) => proof.status))
        : null;
      const evaluation = evaluateLoopHealth({
        snapshot: snapshot ?? null,
        runtimeSignals: requiredRuntimeSignals,
        requiredRuntimeSignalCount: requiredRefs.length,
        localStatus,
        maxSnapshotAgeHours,
        maxRunAgeHours,
      });
      const liveSnapshotProof = snapshot
        ? snapshotProof(snapshot, evaluation.status, evaluation.reason)
        : null;
      const runtimeProofs = runtimeSignals.map(runtimeProof);
      const proofs = liveSnapshotProof
        ? [liveSnapshotProof, ...runtimeProofs]
        : [...runtimeProofs, ...localProofs];
      const family = loopFamilies.find((candidate) => candidate.id === graph?.family);

      return {
        id: entry.id,
        name: entry.name,
        businessPromise: entry.businessPromise,
        owner: entry.owner,
        sourceRepoPath: snapshot?.sourceRepoPath ?? entry.sourceRepoPath,
        actionSurface: entry.actionSurface,
        codexProject: codexProjectFor(entry),
        lastRun: snapshot ? formatTimestamp(snapshot.ranAt ?? snapshot.checkedAt) : formatLastRun(localProofs),
        lastProof: snapshot?.lastProof ?? formatLastProof(localProofs),
        status: evaluation.status,
        reportedStatus: evaluation.reportedStatus,
        monitorStatus: evaluation.monitorStatus,
        healthReason: evaluation.reason,
        nextAction: snapshot?.nextAction ?? entry.nextAction,
        approvalRequired: snapshot?.approvalRequired ?? entry.approvalRequired,
        cadence: entry.cadence,
        healthSource: runtimeSignals.length
          ? ("graph-monitor" as const)
          : snapshot
            ? ("supabase-snapshot" as const)
            : ("local-proof" as const),
        snapshotCheckedAt: snapshot?.checkedAt ?? null,
        lastObservedAt: snapshot?.ranAt ?? snapshot?.checkedAt ?? null,
        freshness: {
          snapshotAgeHours: evaluation.snapshotAgeHours,
          runAgeHours: evaluation.runAgeHours,
          maxSnapshotAgeHours,
          maxRunAgeHours,
        },
        graph: {
          family: graph?.family ?? "unmapped",
          familyLabel: family?.label ?? "Unmapped",
          stage: graph?.stage ?? "unmapped",
          dependsOn: graph?.dependsOn ?? [],
          simplification: graph?.simplification ?? {
            action: "keep" as const,
            target: entry.name,
            reason: "No simplification decision has been recorded.",
          },
        },
        blockedBy: [],
        runtimeSignals,
        proofs,
      };
    })
  );

  const firstPassById = new Map(loops.map((loop) => [loop.id, loop]));
  const resolvedLoops = loops.map((loop) => {
    const blockedBy = loop.graph.dependsOn.flatMap((dependencyId) => {
      const dependency = firstPassById.get(dependencyId);
      return dependency && ["failing", "stale", "unknown"].includes(dependency.status)
        ? [{ id: dependency.id, name: dependency.name, status: dependency.status }]
        : [];
    });
    if (blockedBy.length === 0 || loop.status !== "healthy") return { ...loop, blockedBy };
    return {
      ...loop,
      status: "warning" as const,
      healthReason: `This loop has fresh proof, but ${blockedBy.map((dependency) => dependency.name).join(", ")} is not currently proven.`,
      blockedBy,
    };
  });

  const graphFamilies = loopFamilies.map((family) => {
    const familyLoops = resolvedLoops.filter((loop) => loop.graph.family === family.id);
    return {
      ...family,
      status: worstStatus(familyLoops.map((loop) => loop.status)),
      loopIds: familyLoops.map((loop) => loop.id),
    };
  });
  const runtimeCheckedAt = [...runtimeSignalMap.values()]
    .map((signal) => signal.snapshotAt)
    .sort()
    .at(-1) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    mode: snapshots.size > 0 ? "live-health" : "read-only",
    dataSources: {
      supabaseSnapshots: includeSnapshots && snapshots.size > 0,
      runtimeWatchdog: includeSnapshots && runtimeSignalMap.size > 0,
      runtimeCheckedAt,
      localProofFallback: true,
    },
    summary: {
      total: resolvedLoops.length,
      healthy: resolvedLoops.filter((loop) => loop.status === "healthy").length,
      warning: resolvedLoops.filter((loop) => loop.status === "warning").length,
      failing: resolvedLoops.filter((loop) => loop.status === "failing").length,
      stale: resolvedLoops.filter((loop) => loop.status === "stale").length,
      paused: resolvedLoops.filter((loop) => loop.status === "paused").length,
      unknown: resolvedLoops.filter((loop) => loop.status === "unknown").length,
      approvalRequired: resolvedLoops.filter((loop) => loop.approvalRequired).length,
    },
    graph: { families: graphFamilies },
    loops: resolvedLoops,
  };
}
