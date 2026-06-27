export type SkillEvalStatus = "Missing" | "Partial" | "Has harness";
export type SkillPriority = "P0" | "P1" | "P2";

export interface DojoSkill {
  name: string;
  slug: string;
  description: string;
  domain: string;
  risk: "low" | "medium" | "high";
  evalStatus: SkillEvalStatus;
  priority: SkillPriority;
  path: string;
}

export interface BottleneckLoop {
  name: string;
  priority: string;
  bottleneck: string;
  trigger: string;
  evalBar: string[];
  stopRules: string[];
  status: string;
}

export const dojoSkills: DojoSkill[] = [
  {
    "name": "maverick-jobnimbus-payment-editing",
    "slug": "maverick-jobnimbus-payment-editing",
    "description": "Edit, delete, verify, and eventually record JobNimbus payments for Maverick jobs using the logged-in app browser session when the API key can only read payments.",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-payment-editing/SKILL.md"
  },
  {
    "name": "maverick-supabase-appointment-outcome-lookups",
    "slug": "maverick-supabase-appointment-outcome-lookups",
    "description": "Pull appointment outcomes or audit appointment-status jobs from Supabase by combining tasks, jobs, estimates, invoices, workflow stages, and activities, with local timezone handlin",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-appointment-outcome-lookups/SKILL.md"
  },
  {
    "name": "maverick-supabase-calendar-event-scheduling",
    "slug": "maverick-supabase-calendar-event-scheduling",
    "description": "Schedule or diagnose Maverick calendar events in Supabase/JobNimbus, including calendar-event provenance, work-order/task date sources, and safe internal calendar rows.",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-calendar-event-scheduling/SKILL.md"
  },
  {
    "name": "maverick-supabase-gross-profit-lookups",
    "slug": "maverick-supabase-gross-profit-lookups",
    "description": "Pull Maverick revenue, gross profit, and net/operating profit margin components from Supabase, QBO snapshots, and the cashflow workbook, including source-of-truth caveats, material",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-gross-profit-lookups/SKILL.md"
  },
  {
    "name": "maverick-supabase-material-lookups",
    "slug": "maverick-supabase-material-lookups",
    "description": "Answer Maverick supplier and material-history questions by checking structured Supabase data when GBrain is insufficient. Covers supplier invoice tables, auth quirks, schema inspec",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-material-lookups/SKILL.md"
  },
  {
    "name": "maverick-supabase-payment-deposit-lookups",
    "slug": "maverick-supabase-payment-deposit-lookups",
    "description": "Find a specific payment/deposit by amount and date across JobNimbus and QuickBooks sync tables in Supabase, with correct column/date handling.",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-payment-deposit-lookups/SKILL.md"
  },
  {
    "name": "maverick-supabase-scanner-alert-debugging",
    "slug": "maverick-supabase-scanner-alert-debugging",
    "description": "Diagnose noisy Maverick Supabase/backend Slack alerts, including communication-scanner spam, email/invoice scanner completion noise, and scanner alerts that should be weekly-digest",
    "domain": "Finance/Data",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-supabase-scanner-alert-debugging/SKILL.md"
  },
  {
    "name": "maverick-insurance-claim-money-loop",
    "slug": "maverick-insurance-claim-money-loop",
    "description": "Run insurance claim invoicing loops.",
    "domain": "Insurance",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-insurance-claim-money-loop/SKILL.md"
  },
  {
    "name": "maverick-insurance-roofing-certification",
    "slug": "maverick-insurance-roofing-certification",
    "description": "Fill insurance roofing installation / impact-resistant roof certification forms after Maverick completes a roof. Use when a homeowner, admin, or carrier needs paperwork to prove in",
    "domain": "Insurance",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-insurance-roofing-certification/SKILL.md"
  },
  {
    "name": "maverick-pro-forma-completion-invoice",
    "slug": "maverick-pro-forma-completion-invoice",
    "description": "Generate Maverick insurance pro forma completion invoices, Certificates of Completion, and insurance completion packets from JobNimbus/Supabase data. Use when the team asks to crea",
    "domain": "Insurance",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-pro-forma-completion-invoice/SKILL.md"
  },
  {
    "name": "maverick-gaf-quickmeasure-safe-ordering",
    "slug": "maverick-gaf-quickmeasure-safe-ordering",
    "description": "Safely log into GAF QuickMeasure and stage a single report order with strict guardrails (no funding, no payment actions). Use when Jack asks to enter address, select service, and p",
    "domain": "Operations",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-gaf-quickmeasure-safe-ordering/SKILL.md"
  },
  {
    "name": "maverick-improvifi-financing-assistant",
    "slug": "maverick-improvifi-financing-assistant",
    "description": "Act as Maverick's financing assistant through Improvifi. Use when Jack or the team asks to send financing options, run Improvifi Advisor, choose/send lender links, handle a custome",
    "domain": "Operations",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-improvifi-financing-assistant/SKILL.md"
  },
  {
    "name": "maverick-invoice-matcher-debugging",
    "slug": "maverick-invoice-matcher-debugging",
    "description": "Audit Maverick supplier invoice matching when an invoice should match by address but falls through to PO/name logic or manual review.",
    "domain": "Operations",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-invoice-matcher-debugging/SKILL.md"
  },
  {
    "name": "maverick-roofing-work-order-loop",
    "slug": "maverick-roofing-work-order-loop",
    "description": "Audit active Maverick work orders across Roofing, Gutters, Repair, Windows, Siding, and Warranty by JobNimbus work-order status, classify wrong/stuck statuses, and produce team dir",
    "domain": "Production",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-roofing-work-order-loop/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-browser-ui-automation",
    "slug": "maverick-jobnimbus-browser-ui-automation",
    "description": "Use logged-in JobNimbus browser automation for estimates, measurements, documents, and any JobNimbus workflow that is not safely supported by the public API. This is Jack's preferr",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-browser-ui-automation/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-contact-creation",
    "slug": "maverick-jobnimbus-contact-creation",
    "description": "Create and verify Maverick JobNimbus contacts, especially suppliers/vendors and insurance adjusters/agents found through email, claim PDFs, Supabase, GBrain, or public company page",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-contact-creation/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-estimate-template-design",
    "slug": "maverick-jobnimbus-estimate-template-design",
    "description": "Design Maverick JobNimbus estimate templates from external measurement/report artifacts, existing JN estimates, and trade-specific line-item logic. Use when Jack asks to plan or bu",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-estimate-template-design/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-job-from-openphone",
    "slug": "maverick-jobnimbus-job-from-openphone",
    "description": "Create or update a Maverick JobNimbus job from an OpenPhone/AnswerConnect conversation, extract address/scope/photos, prevent duplicates, attach available MMS media, and verify the",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-job-from-openphone/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-job-renaming",
    "slug": "maverick-jobnimbus-job-renaming",
    "description": "Rename Maverick JobNimbus jobs into the standard primary-name format and keep trade-scope custom fields aligned, without changing any dates or unrelated fields.",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-job-renaming/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-note-creation",
    "slug": "maverick-jobnimbus-note-creation",
    "description": "Add and verify internal notes/activities on Maverick JobNimbus jobs from Slack or chat requests, including fuzzy customer/job lookup and safe note payloads.",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-note-creation/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-task-creation",
    "slug": "maverick-jobnimbus-task-creation",
    "description": "Create and verify Maverick JobNimbus follow-up tasks from Slack/request text, including contact/job lookup, duplicate prevention, due-date handling, and correct JobNimbus API paylo",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-task-creation/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-url-lookups",
    "slug": "maverick-jobnimbus-url-lookups",
    "description": "Resolve a JobNimbus app URL or JNID to the underlying Maverick job details using the JobNimbus API when GBrain search comes up empty.",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-url-lookups/SKILL.md"
  },
  {
    "name": "maverick-openphone-jobnimbus-photo-upload",
    "slug": "maverick-openphone-jobnimbus-photo-upload",
    "description": "Create a JobNimbus job from an OpenPhone conversation and attach MMS/customer photos from that conversation to the JobNimbus job. Use when Jack asks to move OpenPhone photos, MMS/m",
    "domain": "Sales/CRM",
    "risk": "high",
    "evalStatus": "Missing",
    "priority": "P0",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-openphone-jobnimbus-photo-upload/SKILL.md"
  },
  {
    "name": "maverick-insurance-claim-pdf-locator",
    "slug": "maverick-insurance-claim-pdf-locator",
    "description": "Find a customer\u2019s insurance claim PDF or insurer claim-submission channel fast by checking GBrain first, then Supabase insurance_claims/files, then JobNimbus file API when claim re",
    "domain": "Insurance",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-insurance-claim-pdf-locator/SKILL.md"
  },
  {
    "name": "maverick-daily-production-check-builder",
    "slug": "maverick-daily-production-check-builder",
    "description": "Build, modify, test, and safely deploy Maverick's daily-production-check automation phases, especially read-only production guardrails, Slack alert sections, and deterministic vali",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-daily-production-check-builder/SKILL.md"
  },
  {
    "name": "maverick-gutter-scheduling",
    "slug": "maverick-gutter-scheduling",
    "description": "Pull Maverick gutter-type work orders, extract true JobNimbus line-item scope for subcontractor pricing, and prioritize scheduling by roof install date.",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-gutter-scheduling/SKILL.md"
  },
  {
    "name": "maverick-municipal-permit-license-doc-locator",
    "slug": "maverick-municipal-permit-license-doc-locator",
    "description": "Find Maverick municipal permit/license documents, city forms, payment links, and receipts by checking GBrain, Gmail/Drive, attachments, official city sites, and payment portals. Us",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-municipal-permit-license-doc-locator/SKILL.md"
  },
  {
    "name": "maverick-permit-capture-daily-production-check",
    "slug": "maverick-permit-capture-daily-production-check",
    "description": "Sub-skill for Maverick's daily production check permit workflow: detect when roofing jobs need permits, capture paid permit evidence from email/PDFs, update JobNimbus proof fields/",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-permit-capture-daily-production-check/SKILL.md"
  },
  {
    "name": "maverick-permit-map-export",
    "slug": "maverick-permit-map-export",
    "description": "Export Maverick metro permit scraper data from Supabase into address lists, CSV/GeoJSON files, clickable Leaflet/Google Maps views, and neighborhood-scale permit cluster alerts for",
    "domain": "Production",
    "risk": "low",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-permit-map-export/SKILL.md"
  },
  {
    "name": "maverick-roof-material-order-audit",
    "slug": "maverick-roof-material-order-audit",
    "description": "Audit Maverick roof material orders against GAF measurements and local install rules before sending to supplier. Use for requests like \u201ccheck the material order,\u201d \u201cverify ice and w",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-roof-material-order-audit/SKILL.md"
  },
  {
    "name": "maverick-sold-roof-production-prep",
    "slug": "maverick-sold-roof-production-prep",
    "description": "Audit and stage a newly sold Maverick roof for production by checking JobNimbus/Supabase readiness, calendar, materials, work orders, invoice/payment, shingle details, permits, and",
    "domain": "Production",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-sold-roof-production-prep/SKILL.md"
  },
  {
    "name": "maverick-appointment-sms-debugging",
    "slug": "maverick-appointment-sms-debugging",
    "description": "Trace Maverick appointment reminder texts from the sent message back to scheduled_outreach, sms_templates, Supabase edge functions, and JobNimbus task types. Use when a customer go",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-appointment-sms-debugging/SKILL.md"
  },
  {
    "name": "maverick-estimate-contract-doc-builder",
    "slug": "maverick-estimate-contract-doc-builder",
    "description": "Build or improve Maverick customer-facing contract documents attached to estimates, including Terms and Conditions, warranty addenda, cancellation notices, insurance claim addenda,",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-estimate-contract-doc-builder/SKILL.md"
  },
  {
    "name": "maverick-estimate-followup-trigger-builder",
    "slug": "maverick-estimate-followup-trigger-builder",
    "description": "Build and validate a Maverick automation that triggers 24-48h after an estimate is sent, then drafts PDF/web follow-up proposals with dedupe guards.",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-estimate-followup-trigger-builder/SKILL.md"
  },
  {
    "name": "maverick-job-status-audit",
    "slug": "maverick-job-status-audit",
    "description": "Audit Maverick JobNimbus/Supabase job status sync and classify records correctly as deleted candidates, archived/inactive, terminal, or sync-missing without confusing archived jobs",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-job-status-audit/SKILL.md"
  },
  {
    "name": "maverick-job-status-curriculum-builder",
    "slug": "maverick-job-status-curriculum-builder",
    "description": "Build and maintain Maverick JobNimbus status-transition curriculum from GBrain, SecondBrain, Supabase/JobNimbus mirror data, and real job/customer evidence. Use when Jack asks to m",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-job-status-curriculum-builder/SKILL.md"
  },
  {
    "name": "maverick-jobnimbus-task-deletion-audit",
    "slug": "maverick-jobnimbus-task-deletion-audit",
    "description": "Audit Maverick JobNimbus tasks that exist in Supabase but appear deleted or missing from live JobNimbus, then produce a human-readable report with task names, jobs, contacts, due d",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-jobnimbus-task-deletion-audit/SKILL.md"
  },
  {
    "name": "maverick-openphone-callback-monitor-builder",
    "slug": "maverick-openphone-callback-monitor-builder",
    "description": "Build an hourly saved-contact callback monitor from Supabase OpenPhone data, enforce response SLAs, post actionable Slack alerts, and capture human disposition notes for follow-up ",
    "domain": "Sales/CRM",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P1",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-openphone-callback-monitor-builder/SKILL.md"
  },
  {
    "name": "maverick-command-center-dashboard-builder",
    "slug": "maverick-command-center-dashboard-builder",
    "description": "Build or modify Maverick Command Center dashboard KPI cards, API routes, and operating metrics from Supabase/GBrain business logic. Use when Jack asks to put a metric, scoreboard, ",
    "domain": "Finance/Data",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-command-center-dashboard-builder/SKILL.md"
  },
  {
    "name": "maverick-invoicing-report",
    "slug": "maverick-invoicing-report",
    "description": "Maverick Exteriors weekly invoicing recap + daily new-invoice ping, plus ad-hoc revenue/invoice HTML report drafts. Posts to Slack #financials using Hermes's own bot token or deliv",
    "domain": "Finance/Data",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-invoicing-report/SKILL.md"
  },
  {
    "name": "maverick-assessment-first-proposal-design",
    "slug": "maverick-assessment-first-proposal-design",
    "description": "Convert a sales/persuasion idea (often from a clip/post) into a concrete Maverick proposal-system requirement and interactive prototype, using an assessment-first close model.",
    "domain": "Growth",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-assessment-first-proposal-design/SKILL.md"
  },
  {
    "name": "maverick-review-request-agent-builder",
    "slug": "maverick-review-request-agent-builder",
    "description": "Build and monitor a Google review-request automation that migrates goodwill from past customers to a target Google Business Profile using SMS + email, with weekly conversion optimi",
    "domain": "Growth",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-review-request-agent-builder/SKILL.md"
  },
  {
    "name": "maverick-seo-campaign-operator",
    "slug": "maverick-seo-campaign-operator",
    "description": "End-to-end SEO and AI-search (AEO/LLMO) operating system for Maverick Exteriors. Runs daily/weekly/monthly execution loops for local rankings, AI citations, and lead growth.",
    "domain": "Growth",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-seo-campaign-operator/SKILL.md"
  },
  {
    "name": "maverick-seo-insight-operator",
    "slug": "maverick-seo-insight-operator",
    "description": "Digest Maverick SEO/AEO insights from GA4, Search Console, technical audits, or daily reports and convert them into an approval-gated execution plan, GitHub issues, and PR-ready wo",
    "domain": "Growth",
    "risk": "low",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-seo-insight-operator/SKILL.md"
  },
  {
    "name": "maverick-vendor-sourcing-outreach",
    "slug": "maverick-vendor-sourcing-outreach",
    "description": "Build a repeatable Maverick vendor/subcontractor sourcing pipeline: find local trade contractors, benchmark target pricing from GBrain, create a tracker, send approved outreach, mo",
    "domain": "Growth",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-vendor-sourcing-outreach/SKILL.md"
  },
  {
    "name": "maverick-automation-registry-audit",
    "slug": "maverick-automation-registry-audit",
    "description": "Audit Maverick's real automation footprint across OpenClaw, Hermes, Paperclip, GBrain, and SecondBrain, then produce a trusted registry of what is actually running, broken, or just",
    "domain": "Operating System",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-automation-registry-audit/SKILL.md"
  },
  {
    "name": "maverick-closed-loop-skill-builder",
    "slug": "maverick-closed-loop-skill-builder",
    "description": "Turn a Maverick workflow into a closed-loop skill spec, PRD, scorecard item, and supervised-pilot plan. Use when Jack wants to build loops, skill factory work, operational automati",
    "domain": "Operating System",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-closed-loop-skill-builder/SKILL.md"
  },
  {
    "name": "maverick-loop-builder-goal",
    "slug": "maverick-loop-builder-goal",
    "description": "Run a /goal-style interview to design a Maverick business loop.",
    "domain": "Operating System",
    "risk": "medium",
    "evalStatus": "Partial",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-loop-builder-goal/SKILL.md"
  },
  {
    "name": "maverick-operating-knowledge-systems",
    "slug": "maverick-operating-knowledge-systems",
    "description": "Build Maverick's reusable operating knowledge systems: field-knowledge GBrain pages, role-training packs, and read-only department scorecards from real company data.",
    "domain": "Operating System",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-operating-knowledge-systems/SKILL.md"
  },
  {
    "name": "maverick-skill-factory-operator",
    "slug": "maverick-skill-factory-operator",
    "description": "Build and manage Maverick's AI Skill Factory: turn Jack/team voice notes, repeated business workflows, expert brain dumps, and agent failures into a prioritized backlog of closed-l",
    "domain": "Operating System",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-skill-factory-operator/SKILL.md"
  },
  {
    "name": "lastweek-learning",
    "slug": "lastweek-learning",
    "description": "Weekly learning loop from Maverick phone calls. Extract what happened, what worked, what failed, and update SOP-ready guidance for voice, handling, and next actions.",
    "domain": "Operations",
    "risk": "low",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/lastweek-learning/SKILL.md"
  },
  {
    "name": "maverick-applicant-database-builder",
    "slug": "maverick-applicant-database-builder",
    "description": "Build and maintain a reviewable Maverick hiring/applicant database from authorized mailbox searches, authenticated job-board/employer portals, job-board notification emails, resume",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-applicant-database-builder/SKILL.md"
  },
  {
    "name": "maverick-business-operations",
    "slug": "maverick-business-operations",
    "description": "Use when operating Maverick Exteriors business systems across JobNimbus, Supabase, direct mail attribution, HOA requirement research, and field/insurance process data.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-business-operations/SKILL.md"
  },
  {
    "name": "maverick-command-catalog",
    "slug": "maverick-command-catalog",
    "description": "Cross-surface command catalog for Maverick workflows. Use when Jack or the team asks what command to use, wants a Slack slash-command equivalent, or types a command-like alias such",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-command-catalog/SKILL.md"
  },
  {
    "name": "maverick-companycam-api-audit",
    "slug": "maverick-companycam-api-audit",
    "description": "Audit CompanyCam as the capture layer for Maverick inspection-to-homeowner-deliverable workflows. Confirms what can be pulled via API, what still needs JobNimbus/Supabase enrichmen",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-companycam-api-audit/SKILL.md"
  },
  {
    "name": "maverick-companycam-pages-fetch-command",
    "slug": "maverick-companycam-pages-fetch-command",
    "description": "Build and use a command that finds and downloads CompanyCam walkthrough/export PDFs from JobNimbus files, with inspection vs production modes driven by job status.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-companycam-pages-fetch-command/SKILL.md"
  },
  {
    "name": "maverick-contact-info-locator",
    "slug": "maverick-contact-info-locator",
    "description": "Find missing Maverick customer/lead contact info or specific customer/job details across GBrain, JobNimbus, Supabase/OpenPhone, Gmail, Drive, and local exports. Use when Jack or th",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-contact-info-locator/SKILL.md"
  },
  {
    "name": "maverick-customer-eod-priority-triage",
    "slug": "maverick-customer-eod-priority-triage",
    "description": "Rapidly triage the top customer-facing items Jack needs to handle before EOD by combining GBrain, Supabase tasks, OpenPhone SMS/calls, jobs, contacts, and scheduled outreach.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-customer-eod-priority-triage/SKILL.md"
  },
  {
    "name": "maverick-ghl-knowledge-base-upload-pack",
    "slug": "maverick-ghl-knowledge-base-upload-pack",
    "description": "Build a production-ready GHL AI Employee knowledge-base starter pack by validating supported source types/limits from HighLevel docs, then generating upload-ready files (policy doc",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-ghl-knowledge-base-upload-pack/SKILL.md"
  },
  {
    "name": "maverick-github-actions-to-local-launchd",
    "slug": "maverick-github-actions-to-local-launchd",
    "description": "Migrate critical Maverick GitHub Actions scheduled workflows to local macOS launchd runners when Actions minutes are exhausted or a workflow needs local resilience.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-github-actions-to-local-launchd/SKILL.md"
  },
  {
    "name": "maverick-ihm-agentapi-webhook-setup",
    "slug": "maverick-ihm-agentapi-webhook-setup",
    "description": "Set up and validate Interactive Hail Maps Agent API webhooks, then route hail alerts through Supabase -> GHL -> JobNimbus (intent-gated) to avoid CRM noise.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-ihm-agentapi-webhook-setup/SKILL.md"
  },
  {
    "name": "maverick-michael-calendar-orphan-triage",
    "slug": "maverick-michael-calendar-orphan-triage",
    "description": "Triage Michael Blake's orphan Google calendar tasks, classify real homeowner appointments vs personal/admin noise, and decide when to auto-update JobNimbus task links/types.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-michael-calendar-orphan-triage/SKILL.md"
  },
  {
    "name": "maverick-networking-database",
    "slug": "maverick-networking-database",
    "description": "Build and maintain Maverick's internal networking/relationship database in GBrain + SecondBrain. Use when Jack adds a new business-development contact, asks to save a networking me",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-networking-database/SKILL.md"
  },
  {
    "name": "maverick-pdf-workflow-audit",
    "slug": "maverick-pdf-workflow-audit",
    "description": "Audit an existing Maverick inspection/proposal PDF or third-party workflow artifact to decide whether it should be the capture layer, the final homeowner deliverable, or just an in",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-pdf-workflow-audit/SKILL.md"
  },
  {
    "name": "maverick-service-account-google-sheet-intake",
    "slug": "maverick-service-account-google-sheet-intake",
    "description": "Access a user-shared Google Sheet through Maverick's service account from terminal, verify permissions fast, and ingest the data into a searchable subcontractor directory.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-service-account-google-sheet-intake/SKILL.md"
  },
  {
    "name": "maverick-sms-monitor-channel-routing",
    "slug": "maverick-sms-monitor-channel-routing",
    "description": "Route Maverick SMS monitoring reports to the correct Slack channel (#appt-monitor) and verify delivery from GitHub Actions when webhook secrets are incomplete.",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-sms-monitor-channel-routing/SKILL.md"
  },
  {
    "name": "maverick-subcontractor-compliance-doc-locator",
    "slug": "maverick-subcontractor-compliance-doc-locator",
    "description": "Find or verify subcontractor/vendor compliance documents for Maverick, especially COIs, W-9s, insurance certificates, and license docs, by checking GBrain, Supabase contacts/files,",
    "domain": "Operations",
    "risk": "medium",
    "evalStatus": "Missing",
    "priority": "P2",
    "path": "/Users/maverick_ai/.hermes/skills/maverick/maverick-subcontractor-compliance-doc-locator/SKILL.md"
  }
];

export const bottleneckLoops: BottleneckLoop[] = [
  {
    name: "Sales Appointment Prep",
    priority: "First",
    bottleneck: "Prep before sales appointments is slacking and needs a repeatable pre-call packet.",
    trigger: "Upcoming sales appointment or appointment created in JobNimbus/Supabase.",
    evalBar: [
      "Uses real customer/job/source evidence, never invented facts.",
      "Lists missing info and likely buyer objections.",
      "Gives the rep a short discovery plan and next-best action.",
      "Includes the clickable JobNimbus job link when available.",
      "Keeps the brief short enough to use before the appointment.",
    ],
    stopRules: [
      "No customer/job match.",
      "Contradictory appointment or contact data.",
      "Missing source evidence for a claim made in the brief.",
    ],
    status: "Build eval cases, then run five historical appointment reps.",
  },
  {
    name: "Insurance Claim Update Loop",
    priority: "Second",
    bottleneck: "Claim changes force backend rework across supplements, estimates, invoices, work orders, COC, and depreciation release prep.",
    trigger: "New claim PDF, revised carrier estimate, supplement response, or claim-team email.",
    evalBar: [
      "Detects code-required missing scope like ice and water when city code requires it.",
      "Separates approved scope, requested supplement scope, and denied/pending items.",
      "Flags invoice/estimate/work-order/COC updates created by revised RCV.",
      "Avoids double-counting and preserves latest carrier-approved numbers.",
      "Stages external carrier/homeowner emails for approval only.",
    ],
    stopRules: [
      "Missing latest claim PDF or carrier estimate.",
      "City/code requirement is ambiguous.",
      "Money mismatch exceeds threshold or cannot be reconciled.",
      "External send required without approval.",
    ],
    status: "Design stricter eval harness after Sales Appointment Prep skeleton is live.",
  },
];

export const dojoSummary = {
  totalSkills: dojoSkills.length,
  missingEvals: dojoSkills.filter((skill) => skill.evalStatus === "Missing").length,
  partialEvals: dojoSkills.filter((skill) => skill.evalStatus === "Partial").length,
  harnessed: dojoSkills.filter((skill) => skill.evalStatus === "Has harness").length,
  p0: dojoSkills.filter((skill) => skill.priority === "P0").length,
  p1: dojoSkills.filter((skill) => skill.priority === "P1").length,
};
