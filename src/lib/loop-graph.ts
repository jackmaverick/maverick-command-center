import type { LoopCadence } from "@/lib/loop-registry";

export type LoopFamilyId =
  | "production"
  | "operations"
  | "sales"
  | "finance"
  | "growth"
  | "readiness"
  | "learning-infrastructure";

export type RuntimeSignalSource =
  "launchd" | "hermes" | "crontab" | "openclaw" | "runner";

export interface RuntimeSignalRef {
  source: RuntimeSignalSource;
  loopName: string;
  label: string;
  required?: boolean;
}

export interface LoopGraphDefinition {
  loopId: string;
  family: LoopFamilyId;
  stage: string;
  dependsOn: string[];
  runtimeSignals: RuntimeSignalRef[];
  maxSnapshotAgeHours?: number | null;
  maxRunAgeHours?: number | null;
  simplification: {
    action: "keep" | "merge" | "split" | "retire" | "move";
    target: string;
    reason: string;
  };
}

export interface LoopFamilyDefinition {
  id: LoopFamilyId;
  label: string;
  promise: string;
  recommendation: string;
  targetShape: string;
}

export const loopFamilies: LoopFamilyDefinition[] = [
  {
    id: "production",
    label: "Production communication",
    promise:
      "One verified production schedule reaches homeowners and the team, and replies return to the right owner.",
    recommendation:
      "Keep one Production Communication Graph. Materials/install dates are one schedule-version lane; team updates and other supervised homeowner messages become child lanes, not separate top-level loops.",
    targetShape: "3 cards → 1 graph with 3 lanes",
  },
  {
    id: "operations",
    label: "Daily operations",
    promise:
      "Exceptions reach the right person without turning the dashboard itself into another business loop.",
    recommendation:
      "Keep stuck-job detection as a business capability. Treat Michelle Daily Touch as the shared action surface and monitor its publisher as infrastructure rather than calling the packet a separate business loop.",
    targetShape: "2 cards → 1 capability + 1 shared surface",
  },
  {
    id: "sales",
    label: "Sales / estimate prep",
    promise:
      "Every sales appointment has verified source measurements, a prepared rep, and a confirmed customer journey.",
    recommendation:
      "Keep one Sales Readiness Graph. GAF ingest and verified JobNimbus entry feed appointment prep; confirmation, reminders, replies, and no-shows remain downstream nodes rather than separate executive loops.",
    targetShape: "3 cards → 1 graph with estimate-prep and appointment lanes",
  },
  {
    id: "finance",
    label: "Job closeout and cash",
    promise:
      "Supplier documents become job costs, completed work becomes invoices, warranties close, and final payments are collected.",
    recommendation:
      "Merge supplier ingestion, invoice matching, warranty readiness, ledger health, and collections into one Job Closeout & Cash Graph. Preserve each vendor/parser as a node, not a separate executive loop.",
    targetShape: "5 cards → 1 graph with vendor and closeout nodes",
  },
  {
    id: "growth",
    label: "Growth and reputation",
    promise:
      "The site earns demand and completed customers create reputation without duplicate schedulers.",
    recommendation:
      "Merge indexing and content operations into one Website Growth Graph, retire the paused ClickFlow scheduler cluster after confirming it is intentionally replaced, and keep reviews as the reputation branch triggered by job completion.",
    targetShape: "3 cards → 2 graphs; retire paused duplicates",
  },
  {
    id: "readiness",
    label: "Pre-production readiness",
    promise:
      "Permits, product selections, and materials are complete before scheduling creates customer promises.",
    recommendation:
      "Merge permit readiness and shingle/color readiness into one Pre-Production Readiness Graph with city-rule and product-selection branches.",
    targetShape: "2 cards → 1 graph",
  },
  {
    id: "learning-infrastructure",
    label: "Learning and infrastructure",
    promise:
      "The automation platform stays maintainable without obscuring business-loop health.",
    recommendation:
      "Move learning cadence and repo/worktree cleanliness to a separate Agent & Infrastructure Health page. They matter, but they are not customer or revenue loops.",
    targetShape: "2 business cards → infrastructure page",
  },
];

export const loopGraphDefinitions: LoopGraphDefinition[] = [
  {
    loopId: "homeowner-production-texts",
    family: "production",
    stage: "other supervised homeowner messages",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.daily-production-check",
        label: "Morning production runner",
      },
      {
        source: "launchd",
        loopName: "com.maverick.daily-production-check-afternoon",
        label: "Afternoon production runner",
      },
    ],
    simplification: {
      action: "split",
      target: "Production Communication Graph / supervised-message lane",
      reason:
        "Materials and install dates already have their own shared schedule-version graph; keep only message types with a different trigger or approval policy here.",
    },
  },
  {
    loopId: "production-team-work-order-updates",
    family: "production",
    stage: "internal production updates",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.daily-production-check",
        label: "Morning production runner",
      },
      {
        source: "launchd",
        loopName: "com.maverick.daily-production-check-afternoon",
        label: "Afternoon production runner",
      },
    ],
    simplification: {
      action: "merge",
      target: "Production Communication Graph / team-update lane",
      reason:
        "It reads the same work-order and schedule state as homeowner communication; only the audience and approval rule differ.",
    },
  },
  {
    loopId: "production-communication-closed-loop",
    family: "production",
    stage: "materials/install schedule and replies",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.production-communication-graph",
        label: "Reply graph runner",
      },
      {
        source: "launchd",
        loopName: "com.maverick.production-communication-health-publisher",
        label: "Graph health publisher",
      },
    ],
    maxSnapshotAgeHours: 0.75,
    maxRunAgeHours: 0.75,
    simplification: {
      action: "keep",
      target: "Production Communication Graph",
      reason:
        "Material delivery and install date are one schedule version and must be corrected together when a homeowner objects.",
    },
  },
  {
    loopId: "stuck-status-jobs",
    family: "operations",
    stage: "detect stuck work",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.status-transition-intelligence",
        label: "Status transition monitor",
      },
    ],
    simplification: {
      action: "keep",
      target: "Daily Operations Graph / stuck-work detector",
      reason:
        "This is a distinct exception detector with a clear business promise and owner.",
    },
  },
  {
    loopId: "michelle-admin-daily-action-packet",
    family: "operations",
    stage: "publish shared action surface",
    dependsOn: ["stuck-status-jobs"],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.michelle-dashboard-refresh",
        label: "Daily Touch publisher",
      },
      {
        source: "launchd",
        loopName: "com.maverick.michelle-dashboard-refresh-requests",
        label: "Refresh request processor",
      },
    ],
    simplification: {
      action: "move",
      target: "Shared action-surface infrastructure",
      reason:
        "Daily Touch is where multiple loops are worked; monitoring its publisher is necessary, but it is not a separate customer outcome.",
    },
  },
  {
    loopId: "appointment-prep-loop",
    family: "sales",
    stage: "prepare appointment",
    dependsOn: ["gaf_measurements_to_jobnimbus"],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.appointment-prep-loop",
        label: "Appointment prep launchd",
      },
      {
        source: "hermes",
        loopName: "Maverick Appointment Prep Daily Email",
        label: "Appointment prep email",
        required: false,
      },
    ],
    simplification: {
      action: "merge",
      target: "Appointment Lifecycle Graph",
      reason:
        "Prep and reminder decisions share the same appointment task and should advance one appointment state machine.",
    },
  },
  {
    loopId: "gaf_measurements_to_jobnimbus",
    family: "sales",
    stage: "GAF ingest → verified source row → JobNimbus entry → readback",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "runner",
        loopName: "gaf_measurements_to_jobnimbus",
        label: "GAF measurements owning runner",
      },
    ],
    maxSnapshotAgeHours: 36,
    maxRunAgeHours: 36,
    simplification: {
      action: "merge",
      target: "Sales Readiness Graph / estimate-prep lane",
      reason:
        "Email ingest, provenance validation, browser entry, and readback are dependent nodes of one measurement promise, not four independent loops.",
    },
  },
  {
    loopId: "appointment-sms-reminders",
    family: "sales",
    stage: "confirm and monitor appointment",
    dependsOn: ["appointment-prep-loop"],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.daily-sms-sync",
        label: "SMS sync runtime",
      },
    ],
    maxSnapshotAgeHours: 1,
    maxRunAgeHours: 1,
    simplification: {
      action: "merge",
      target: "Appointment Lifecycle Graph",
      reason:
        "Confirmation, reminders, replies, and no-shows are successive states of the same appointment rather than independent loops.",
    },
  },
  {
    loopId: "gutter-invoice-reconciliation-loop",
    family: "finance",
    stage: "match subcontractor invoices",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.michelle-dashboard-refresh",
        label: "Gutter task publisher",
      },
    ],
    simplification: {
      action: "merge",
      target: "Job Closeout & Cash Graph / subcontractor-invoice node",
      reason:
        "Gutter matching is one vendor-specific branch between work completion and the common cost ledger.",
    },
  },
  {
    loopId: "richards-billtrust-invoice-loop",
    family: "finance",
    stage: "ingest supplier invoices",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.richards-billtrust-daily",
        label: "Richards daily ingestion",
      },
    ],
    simplification: {
      action: "merge",
      target: "Job Closeout & Cash Graph / supplier-ingestion node",
      reason:
        "Richards is a source adapter whose output should feed the shared invoice and job-cost graph.",
    },
  },
  {
    loopId: "invoice-ledger-health-loop",
    family: "finance",
    stage: "reconcile job costs and invoice state",
    dependsOn: [
      "richards-billtrust-invoice-loop",
      "gutter-invoice-reconciliation-loop",
    ],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.invoice-fast",
        label: "Fast invoice scanner",
      },
      {
        source: "launchd",
        loopName: "com.maverick.invoice-full",
        label: "Full invoice scanner",
        required: false,
      },
      {
        source: "launchd",
        loopName: "com.maverick.invoice-due-date-loop",
        label: "Due-date alignment",
      },
    ],
    simplification: {
      action: "merge",
      target: "Job Closeout & Cash Graph / ledger node",
      reason:
        "This is the shared state between every supplier parser, warranty closeout, final invoice, and collections action.",
    },
  },
  {
    loopId: "manufacturer-warranty-loop",
    family: "finance",
    stage: "complete closeout documents",
    dependsOn: ["invoice-ledger-health-loop"],
    runtimeSignals: [],
    simplification: {
      action: "merge",
      target: "Job Closeout & Cash Graph / warranty node",
      reason:
        "Warranty submission is a closeout milestone dependent on installed work and verified product data, not a standalone operating loop.",
    },
  },
  {
    loopId: "collections-final-payment-follow-up",
    family: "finance",
    stage: "collect final payment",
    dependsOn: ["invoice-ledger-health-loop", "manufacturer-warranty-loop"],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "maverick-repair-collections-payment-texts",
        label: "Collections follow-up runner",
      },
      {
        source: "launchd",
        loopName: "com.maverick.invoice-due-date-loop",
        label: "Invoice due-date runner",
      },
    ],
    simplification: {
      action: "merge",
      target: "Job Closeout & Cash Graph / collections node",
      reason:
        "Collections is the final state of the same invoice graph and should inherit verified balance, due date, and contact policy.",
    },
  },
  {
    loopId: "website-growth-clickflow-loop",
    family: "growth",
    stage: "select and draft content work",
    dependsOn: ["website-indexing-loop"],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "maverick-clickflow-content-opportunity-weekly-scan",
        label: "ClickFlow opportunity scan",
      },
      {
        source: "hermes",
        loopName: "maverick-clickflow-approved-daily-publisher",
        label: "ClickFlow publisher",
      },
    ],
    simplification: {
      action: "retire",
      target: "Website Growth Graph",
      reason:
        "The ClickFlow scheduler cluster is paused; confirm the SEO operator replaced it, then delete the duplicate schedules and keep ClickFlow only as an input source if still useful.",
    },
  },
  {
    loopId: "website-indexing-loop",
    family: "growth",
    stage: "inspect crawl and index state",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "maverick-seo-daily-operator",
        label: "Daily SEO operator",
      },
    ],
    simplification: {
      action: "merge",
      target: "Website Growth Graph",
      reason:
        "Index inspection is the gate before content work and belongs in the same inspect-decide-publish-measure graph.",
    },
  },
  {
    loopId: "google-reviews-loop",
    family: "growth",
    stage: "request and monitor reviews",
    dependsOn: ["manufacturer-warranty-loop"],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "review-growth-engine-daily-queue",
        label: "Review request queue",
      },
      {
        source: "hermes",
        loopName: "review-agent-daily-heartbeat",
        label: "Review monitor",
      },
    ],
    simplification: {
      action: "keep",
      target: "Reputation Graph",
      reason:
        "Reviews have a distinct customer outcome, but eligibility should be triggered by verified completion rather than another independent scan of the world.",
    },
  },
  {
    loopId: "permit-mia-loop",
    family: "readiness",
    stage: "permit readiness",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "launchd",
        loopName: "com.maverick.permit-loop-mia-digest",
        label: "Permit digest runner",
      },
      {
        source: "hermes",
        loopName: "maverick-permit-loop-mia-email-digest",
        label: "Legacy permit email",
        required: false,
      },
    ],
    simplification: {
      action: "merge",
      target: "Pre-Production Readiness Graph / permit branch",
      reason:
        "Permit readiness and product readiness both gate the same scheduling decision and should expose blockers through one graph.",
    },
  },
  {
    loopId: "shingle-color-material-sync-loop",
    family: "readiness",
    stage: "product selection readiness",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "true-installed-roof-shingle-sync",
        label: "Installed shingle sync",
      },
      {
        source: "launchd",
        loopName: "com.maverick.product-trade-scope-color-l2",
        label: "Product/color validator",
      },
    ],
    simplification: {
      action: "merge",
      target: "Pre-Production Readiness Graph / product branch",
      reason:
        "Color, material, permit, and schedule readiness are constraints on the same job-ready decision.",
    },
  },
  {
    loopId: "weekly-learning-loop",
    family: "learning-infrastructure",
    stage: "capture reusable learning",
    dependsOn: [],
    runtimeSignals: [
      {
        source: "hermes",
        loopName: "lastweek-learning-weekly",
        label: "Weekly learning compiler",
      },
      {
        source: "hermes",
        loopName: "Weekly GBrain Growth Update",
        label: "GBrain growth update",
        required: false,
      },
    ],
    simplification: {
      action: "move",
      target: "Agent & Infrastructure Health",
      reason:
        "Learning improves every loop but is platform maintenance, not a direct customer or revenue promise.",
    },
  },
  {
    loopId: "repo-worktree-health",
    family: "learning-infrastructure",
    stage: "maintain deployment hygiene",
    dependsOn: [],
    runtimeSignals: [
      { source: "crontab", loopName: "git-sync.sh", label: "Git sync runtime" },
      {
        source: "crontab",
        loopName: "daily-pull-all.sh",
        label: "Daily repo pull",
      },
    ],
    simplification: {
      action: "move",
      target: "Agent & Infrastructure Health",
      reason:
        "A dirty worktree is an engineering condition and should never appear as a failed customer-facing business loop.",
    },
  },
];

export const loopGraphById = new Map(
  loopGraphDefinitions.map((definition) => [definition.loopId, definition]),
);

export function defaultFreshnessHours(cadence: LoopCadence): number | null {
  return {
    continuous: 1,
    daily: 36,
    weekly: 192,
    manual: null,
  }[cadence];
}
