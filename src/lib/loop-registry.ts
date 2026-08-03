export type LoopStatus = "healthy" | "warning" | "failing" | "unknown";

export type LoopCadence = "daily" | "weekly" | "continuous" | "manual";

export interface LoopProofSource {
  label: string;
  kind: "file" | "directory" | "git";
  path: string;
  nameIncludes?: string[];
  freshnessHours?: number;
  failurePatterns?: string[];
  successPatterns?: string[];
}

export interface LoopRegistryEntry {
  id: string;
  name: string;
  businessPromise: string;
  owner: string;
  sourceRepoPath: string;
  cadence: LoopCadence;
  approvalRequired: boolean;
  nextAction: string;
  proofSources: LoopProofSource[];
}

export const loopRegistry: LoopRegistryEntry[] = [
  {
    id: "homeowner-production-texts",
    name: "Homeowner production texts",
    businessPromise:
      "Homeowners get timely install, schedule-change, and production-status updates without unapproved live sends.",
    owner: "Jack / Michael",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors/daily-production-check",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Open the latest daily-production-check run and confirm planned approval tasks or live proof before trusting the loop.",
    proofSources: [
      {
        label: "latest production check run",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/daily-production-check/runs",
        freshnessHours: 36,
        failurePatterns: ["HTTPError", "522 Server Error", "failed immediately"],
        successPatterns: ["homeowner_approval_tasks", "prod_install_morning", "prod_work_order_reschedule_notice"],
      },
      {
        label: "scheduler memory",
        kind: "file",
        path: "/Users/maverick_ai/.codex/automations/daily-work-order-subcontractor-photo-links/memory.md",
        freshnessHours: 36,
        failurePatterns: ["failed immediately", "No new audit file", "522 Server Error"],
      },
    ],
  },
  {
    id: "production-team-work-order-updates",
    name: "Production team work-order/date-change updates",
    businessPromise:
      "Sales and production teammates get the same install-date and work-order movement signals the automation sees.",
    owner: "Production / Bob-facing update loop",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors/daily-production-check",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Trace the latest salesperson/subcontractor update rows against delivery proof before calling this fully healthy.",
    proofSources: [
      {
        label: "production update actions",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/daily-production-check/runs",
        freshnessHours: 36,
        failurePatterns: ["HTTPError", "522 Server Error", "failed immediately"],
        successPatterns: ["salesperson_update_texts", "subcontractor_confirmation_texts", "prod_bob_salesperson_production_update"],
      },
      {
        label: "CompanyCam send ledger",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/daily-production-check/runs/subcontractor-companycam-send-ledger.jsonl",
        freshnessHours: 72,
        successPatterns: ["openphone_message_id", "sent_at"],
      },
    ],
  },
  {
    id: "stuck-status-jobs",
    name: "Jobs stuck in status too long",
    businessPromise:
      "Jobs that sit too long in the wrong JobNimbus status are surfaced with owner, evidence, and next step.",
    owner: "Michelle / Jack",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors/reports/status-transition-intelligence",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Confirm the status-transition watchlist is fresh and that Michelle has a readable action surface for the stale rows.",
    proofSources: [
      {
        label: "status transition watchlist",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/status-transition-intelligence/status-transition-watchlist-latest.json",
        freshnessHours: 168,
        failurePatterns: ["error", "failed"],
        successPatterns: ["status", "watchlist", "jobs"],
      },
      {
        label: "status scorecard",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/status-transition-intelligence/status-transition-scorecard-latest.md",
        freshnessHours: 168,
      },
    ],
  },
  {
    id: "michelle-admin-daily-action-packet",
    name: "Michelle/admin daily action packet",
    businessPromise:
      "Michelle starts the day from one actionable packet instead of hunting across reports, Slack, and stale sheets.",
    owner: "Michelle / Jack",
    sourceRepoPath:
      "/Users/maverick_ai/supabase-maverick-exteriors/reports/michelle-daily-touch-list",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Use the generated dashboard timestamp and refresh logs; if stale, run the refresh path before making sheet/report claims.",
    proofSources: [
      {
        label: "dashboard snapshot",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/michelle-daily-touch-list/vercel-app/data/dashboard.json",
        freshnessHours: 36,
        successPatterns: ["generated_at", "contact_info_recent_completed"],
      },
      {
        label: "latest refresh log",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/michelle-daily-touch-list/logs/latest-refresh.env",
        freshnessHours: 36,
      },
    ],
  },
  {
    id: "gutter-invoice-reconciliation-loop",
    name: "Gutter invoice reconciliation loop",
    businessPromise:
      "Completed gutter work orders are checked against Goodman, Gutter Tech, and Lindsey/Vonn invoices before contractor payment or closeout.",
    owner: "Michelle / Finance",
    sourceRepoPath:
      "/Users/maverick_ai/supabase-maverick-exteriors/reports/michelle-daily-touch-list/vercel-app/data/dashboard.json",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Work missing vendor invoices, duplicate-version warnings, and invoice/WO mismatch blockers before paying or closing gutter work orders.",
    proofSources: [
      {
        label: "Michelle gutter invoice reconciliation",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/michelle-daily-touch-list/vercel-app/data/dashboard.json",
        freshnessHours: 36,
        failurePatterns: ["Traceback", "HTTP 500", "failed"],
        successPatterns: [
          "gutter_invoice_reconciliation",
          "No gutter vendor invoice found",
          "matches WO total",
          "invoice_missing_trade_lines:gutters",
        ],
      },
    ],
  },
  {
    id: "collections-final-payment-follow-up",
    name: "Collections/final payment follow-up",
    businessPromise:
      "Final-payment follow-up is previewed safely with repair/retail eligibility counts before any customer send.",
    owner: "Jack / Finance",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Treat failures as blockers; keep using dry-run preview until repair and retail counts are available again.",
    proofSources: [
      {
        label: "collections preview memory",
        kind: "file",
        path: "/Users/maverick_ai/.codex/automations/collections-text-dry-run-email/memory.md",
        freshnessHours: 36,
        failurePatterns: ["failed before report generation", "HTTP 500", "counts were unavailable"],
        successPatterns: ["Result: ok", "email.status sent", "status=ok"],
      },
      {
        label: "latest collections preview artifact",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/collections-text-dry-run-preview-2026-07-09.html",
        freshnessHours: 168,
        failurePatterns: ["HTTP 500", "failed"],
        successPatterns: ["sendable", "held", "skipped"],
      },
    ],
  },
  {
    id: "website-growth-clickflow-loop",
    name: "Website growth / ClickFlow loop",
    businessPromise:
      "SEO and content opportunities are turned into approval-gated work without publishing or ClickFlow writes by accident.",
    owner: "Jack / Website Growth",
    sourceRepoPath: "/Users/maverick_ai/website",
    cadence: "weekly",
    approvalRequired: true,
    nextAction:
      "Check the latest SEO/content queue and confirm whether ClickFlow work is still draft-only and approval-gated.",
    proofSources: [
      {
        label: "website planner script",
        kind: "file",
        path: "/Users/maverick_ai/website/scripts/weekly_seo_content_plan.py",
        freshnessHours: 720,
        successPatterns: ["No ClickFlow writes", "approval queue", "does not publish"],
      },
      {
        label: "website repository state",
        kind: "git",
        path: "/Users/maverick_ai/website",
      },
    ],
  },
  {
    id: "website-indexing-loop",
    name: "Website indexing loop",
    businessPromise:
      "Google can crawl the live site, read the sitemap, and surface priority money pages without hidden crawl/index blockers.",
    owner: "Jack / Website Growth",
    sourceRepoPath: "/Users/maverick_ai/worktrees/website-growth-loop",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Check the latest daily growth report and technical checks; if stale or failing, rerun indexing checks before creating content work.",
    proofSources: [
      {
        label: "latest SEO growth report",
        kind: "directory",
        path: "/Users/maverick_ai/website/docs/seo-reports",
        nameIncludes: ["daily-growth"],
        freshnessHours: 72,
        failurePatterns: ["robots status: 404", "sitemap index status: 404", "GA4/GSC measurement status: **Blocked**"],
        successPatterns: ["GA4/GSC measurement status: **Healthy**", "Robots status: 200", "Sitemap index status: 200", "No crawl/index P0"],
      },
      {
        label: "latest technical checks data",
        kind: "directory",
        path: "/Users/maverick_ai/website/docs/seo-reports/data",
        nameIncludes: ["technical-checks"],
        freshnessHours: 72,
        failurePatterns: ["\"status\": 404", "\"status\": 500", "\"indexable\": false"],
        successPatterns: ["sitemap", "robots", "canonical"],
      },
      {
        label: "website growth worktree",
        kind: "git",
        path: "/Users/maverick_ai/worktrees/website-growth-loop",
      },
    ],
  },
  {
    id: "google-reviews-loop",
    name: "Google reviews loop",
    businessPromise:
      "Completed happy customers are asked for Google reviews at the right time, without over-messaging or sending without approval.",
    owner: "Jack / Sales / Production",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Repair GBP auth and Python dependency issues, then confirm the latest review sequence preview before approving any outreach.",
    proofSources: [
      {
        label: "Google review monitor state",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/google-review-monitor-state.json",
        freshnessHours: 72,
        failurePatterns: ["auth_needed", "unauthorized_client", "missing_from_supabase", "Traceback"],
        successPatterns: ["finished_at", "review_count", "supabase_count_after"],
      },
      {
        label: "latest review sequence preview",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports",
        nameIncludes: ["google-review-sequence-preview"],
        freshnessHours: 72,
        failurePatterns: ["Traceback", "ModuleNotFoundError", "unauthorized_client"],
        successPatterns: ["Approval file", "Denial file", "review"],
      },
    ],
  },
  {
    id: "appointment-prep-loop",
    name: "Appointment prep loop",
    businessPromise:
      "Upcoming appointments are reviewed before the rep or repair tech shows up, with blockers, evidence, and prep questions surfaced early.",
    owner: "Sales / Repair / Jack",
    sourceRepoPath:
      "/Users/maverick_ai/supabase-maverick-exteriors/reports/appointment-prep-daily-email",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Refresh the appointment-prep report; the latest artifact should be current before trusting the appointment board.",
    proofSources: [
      {
        label: "latest appointment prep packet",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/appointment-prep-daily-email",
        nameIncludes: ["appointment-prep"],
        freshnessHours: 36,
        failurePatterns: ["Traceback", "failed", "error"],
        successPatterns: ["Appointments:", "Blocked:", "Needs Review:", "Ready:"],
      },
    ],
  },
  {
    id: "appointment-sms-reminders",
    name: "Appointment SMS reminders",
    businessPromise:
      "Qualified JobNimbus appointment tasks queue confirmation, 24-hour, and 2-hour homeowner reminder texts with previewable proof before live sends.",
    owner: "Sales / Admin / Jack",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors",
    cadence: "continuous",
    approvalRequired: true,
    nextAction:
      "Investigate why Jeanette Metzler's Retail - Sales Appointment task produced zero scheduled_outreach rows, then restore committed SMS health and preview proof in the clean ops worktree.",
    proofSources: [
      {
        label: "appointment SMS sender function",
        kind: "file",
        path: "/Users/maverick_ai/worktrees/ops-automation-loop-fixes/supabase/functions/send-appointment-sms/index.ts",
        successPatterns: ["scheduled_outreach", "failure_reason", "send-appointment-sms"],
        failurePatterns: ["TODO", "not implemented"],
      },
      {
        label: "appointment SMS queue health script",
        kind: "file",
        path: "/Users/maverick_ai/worktrees/ops-automation-loop-fixes/scripts/sms_health_check.py",
        successPatterns: ["scheduled_outreach", "send-appointment-sms", "--json"],
        failurePatterns: ["Traceback", "failed"],
      },
      {
        label: "appointment SMS preview script",
        kind: "file",
        path: "/Users/maverick_ai/worktrees/ops-automation-loop-fixes/scripts/sms_preview_report.py",
        successPatterns: ["scheduled_outreach", "pending", "appointment"],
        failurePatterns: ["Traceback", "failed"],
      },
    ],
  },
  {
    id: "permit-mia-loop",
    name: "Permit/Mia readiness loop",
    businessPromise:
      "Roofing permit packets are staged for Mia only when required inputs are present, city rules are respected, and submit/payment stays review-gated.",
    owner: "Mia / Jack",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors/reports",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Review the latest permit approval requests and missing-input blockers before any city portal submit/payment action.",
    proofSources: [
      {
        label: "permit Mia review",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/permit-loop-mia-review.json",
        freshnessHours: 72,
        failurePatterns: ["Traceback", "HTTP 500", "failed"],
        successPatterns: ["candidate_count", "sendable_count", "suppressed"],
      },
      {
        label: "permit approval requests",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/permit-loop-approval-requests.json",
        freshnessHours: 72,
        failurePatterns: ["Traceback", "HTTP 500", "failed"],
        successPatterns: ["review_only", "request_count", "ready_for_review_count"],
      },
      {
        label: "latest permit digest log",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/logs/permit-loop",
        nameIncludes: ["permit-loop-mia"],
        freshnessHours: 72,
        failurePatterns: ["Traceback", "HTTP 500", "failed"],
      },
    ],
  },
  {
    id: "shingle-color-material-sync-loop",
    name: "Shingle color/material sync loop",
    businessPromise:
      "Confirmed homeowner shingle-color decisions are found from conversations and safely reflected in material/order review without cross-customer writes.",
    owner: "Production / Mia",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors",
    cadence: "daily",
    approvalRequired: true,
    nextAction:
      "Repair Supabase/OpenPhone data access when stale, then verify any color candidate before allowing JobNimbus material/order writes.",
    proofSources: [
      {
        label: "daily shingle color memory",
        kind: "file",
        path: "/Users/maverick_ai/.codex/automations/daily-shingle-color-sms-report/memory.md",
        freshnessHours: 48,
        failurePatterns: ["Could not verify live", "Cloudflare 522", "CROSS_CANDIDATE_MISMATCH", "timed out"],
        successPatterns: ["NO_SHINGLE_COLOR_MENTIONS", "No JobNimbus/OpenPhone write was attempted", "Write results"],
      },
    ],
  },
  {
    id: "richards-billtrust-invoice-loop",
    name: "Richards/Billtrust invoice ingestion loop",
    businessPromise:
      "Richards material invoices are downloaded, matched, line-synced, uploaded to JobNimbus, and counted in gross profit without forcing weak matches.",
    owner: "Finance / Jack",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Review unmatched/manual invoices and keep the Billtrust open-grid sweep running until GP-ready counts are current.",
    proofSources: [
      {
        label: "Richards ingestion memory",
        kind: "file",
        path: "/Users/maverick_ai/.codex/automations/richards-billtrust-daily-invoice-ingestion/memory.md",
        freshnessHours: 48,
        failurePatterns: ["Traceback", "download failed", "edge extraction failed", "HTTP 500"],
        successPatterns: ["GP-ready after run", "New invoice rows inserted", "JobNimbus upload verification"],
      },
    ],
  },
  {
    id: "manufacturer-warranty-loop",
    name: "Manufacturer warranty loop",
    businessPromise:
      "Eligible roof systems are identified, warranty tasks stay aligned, and completion waits for real certificate/receipt proof.",
    owner: "Production / Admin",
    sourceRepoPath:
      "/Users/maverick_ai/supabase-maverick-exteriors/reports/manufacturer-warranty-loop",
    cadence: "daily",
    approvalRequired: false,
    nextAction:
      "Work ready-to-apply warranty cases and attach returned receipt/certificate proof before marking tasks complete.",
    proofSources: [
      {
        label: "latest manufacturer warranty report",
        kind: "directory",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/manufacturer-warranty-loop",
        nameIncludes: ["manufacturer-warranty-loop"],
        freshnessHours: 36,
        failurePatterns: ["Traceback", "HTTP 500", "error"],
        successPatterns: ["generated_at", "application_status", "proof_state"],
      },
    ],
  },
  {
    id: "invoice-ledger-health-loop",
    name: "Invoice/material ledger health loop",
    businessPromise:
      "Supplier invoice coverage, line totals, exception queues, and material costs stay visible before gross-profit numbers are trusted.",
    owner: "Finance / Jack",
    sourceRepoPath: "/Users/maverick_ai/supabase-maverick-exteriors/reports/invoice-ledger-health",
    cadence: "weekly",
    approvalRequired: false,
    nextAction:
      "Refresh invoice ledger health and clear exception work queues before relying on GP dashboards for closeout decisions.",
    proofSources: [
      {
        label: "latest invoice ledger health report",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/invoice-ledger-health/2026-07-20/invoice-ledger-health-2026-07-20.md",
        freshnessHours: 240,
        failurePatterns: ["Traceback", "failed", "error"],
        successPatterns: ["invoice", "ledger", "health"],
      },
      {
        label: "latest invoice repair manifest",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/invoice-ledger-health/2026-07-20/invoice-repair-manifest-2026-07-20.json",
        freshnessHours: 240,
        failurePatterns: ["Traceback", "failed", "error"],
        successPatterns: ["invoice", "repair"],
      },
    ],
  },
  {
    id: "weekly-learning-loop",
    name: "Weekly AI learning loop",
    businessPromise:
      "The business learns from status movement, customer signals, review outcomes, and operator feedback instead of repeating the same guesses.",
    owner: "Jack / AI Ops",
    sourceRepoPath:
      "/Users/maverick_ai/supabase-maverick-exteriors/reports/weekly-learning-scorecard",
    cadence: "weekly",
    approvalRequired: false,
    nextAction:
      "Feed back the weekly minimum review, action ledger, stale rows, and decision causes so the loop can actually learn.",
    proofSources: [
      {
        label: "weekly loop audit",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/weekly-learning-scorecard/weekly-loop-audit-latest.md",
        freshnessHours: 240,
        failurePatterns: ["critical / feedback_loop", "learning_loop_not_ready", "invalid API key", "instrumentation_blocked"],
        successPatterns: ["Weekly Intelligence Loop Audit", "Downstream Value", "Feature Learning Coverage"],
      },
      {
        label: "weekly learning scorecard",
        kind: "file",
        path: "/Users/maverick_ai/supabase-maverick-exteriors/reports/weekly-learning-scorecard/weekly-learning-scorecard-latest.md",
        freshnessHours: 240,
        failurePatterns: ["critical", "failed", "invalid API key"],
        successPatterns: ["learning", "scorecard"],
      },
    ],
  },
  {
    id: "repo-worktree-health",
    name: "Repo/worktree health",
    businessPromise:
      "Jack can see whether the local work surfaces are clean enough to trust before starting new automation work.",
    owner: "Jack / Codex",
    sourceRepoPath: "/Users/maverick_ai/worktrees/loop-health-cockpit",
    cadence: "continuous",
    approvalRequired: false,
    nextAction:
      "Keep this cockpit branch clean and use dirty-count warnings to decide whether to branch, triage, or pause.",
    proofSources: [
      {
        label: "cockpit worktree",
        kind: "git",
        path: "/Users/maverick_ai/worktrees/loop-health-cockpit",
      },
      {
        label: "automation repo worktree",
        kind: "git",
        path: "/Users/maverick_ai/supabase-maverick-exteriors",
      },
      {
        label: "website repo worktree",
        kind: "git",
        path: "/Users/maverick_ai/website",
      },
    ],
  },
];
