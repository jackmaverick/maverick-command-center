// Chart colors matching PRD dark theme
export const CHART_COLORS = [
  "#58a6ff", // Blue (primary)
  "#3fb950", // Green
  "#d29922", // Amber
  "#a371f7", // Purple
  "#8b949e", // Gray
  "#f85149", // Red
  "#79c0ff", // Light blue
  "#56d364", // Light green
] as const;

// Segment definitions
// Real Estate is a cross-cutting segment (custom field = '🔑')
// Record types: Retail, Insurance, Repairs, Warranty
export const SEGMENTS = {
  real_estate: { label: "Real Estate", color: "#a371f7", icon: "🏠" },
  retail: { label: "Retail", color: "#58a6ff", icon: "🏗️" },
  insurance: { label: "Insurance", color: "#d29922", icon: "🛡️" },
  repairs: { label: "Repairs", color: "#3fb950", icon: "🔧" },
  warranty: { label: "Warranty", color: "#79c0ff", icon: "⚙️" },
} as const;

export type Segment = keyof typeof SEGMENTS;

// Trade filter definitions for pipeline
// Uses install custom field strings (exact emoji + Y match required)
export const TRADE_FILTERS = {
  all: { label: "All Trades", description: "All jobs (excludes Warranty record type)" },
  none: { 
    label: "No Trade CF", 
    description: "Jobs with NO trade install custom fields set (none of cf_string_24/25/26/27 equal their Yes values). Useful for DQ/tagging review."
  },
  roof: { label: "Roof", cf: "cf_string_24", value: "🏠 Y" },
  gutters: { label: "Gutters", cf: "cf_string_26", value: "💧Y" },
  windows: { label: "Windows", cf: "cf_string_27", value: "🪟 Y" },
} as const;

export type TradeFilter = keyof typeof TRADE_FILTERS;

// Trade install custom field mappings (for "no trade CF" predicate)
export const TRADE_CF_YES_VALUES = {
  cf_string_24: "🏠 Y",   // Roof
  cf_string_25: "🧱 Y",   // Siding (not in UI filter but included in "no trade CF" check)
  cf_string_26: "💧Y",    // Gutters (NO SPACE between emoji and Y)
  cf_string_27: "🪟 Y",   // Windows
} as const;

// Pipeline stage definitions kept for backward compatibility with sales funnel
export const STAGES = [
  "Lead",
  "Appointment Scheduled",
  "Appointment Ran",
  "Estimating",
  "Sold",
  "Production",
  "Invoicing",
  "Completed",
] as const;

export type Stage = (typeof STAGES)[number];

// JN status to stage mapping
export const STATUS_TO_STAGE: Record<string, Stage> = {
  // Lead stage
  Lead: "Lead",
  New: "Lead",
  "Cold Lead": "Lead",
  Cold: "Lead",
  "Storm Alert": "Lead",
  "Appointment Scheduled": "Appointment Scheduled",
  "Adjuster Appt Scheduled": "Appointment Scheduled",
  // Appointment ran stage
  "Appt Ran": "Appointment Ran",
  "Appointment Ran": "Appointment Ran",
  "Adjuster Appt Ran": "Appointment Ran",
  // Estimating stage
  Estimating: "Estimating",
  "Estimate Sent": "Estimating",
  "Claim Review": "Estimating",
  "Scope Approval": "Estimating",
  "Waiting on Claim": "Estimating",
  "No Damage": "Estimating",
  // Sold stage
  "Sold Job": "Sold",
  "Signed Contract": "Sold",
  "Fully Approved": "Sold",
  "Deductible Collected": "Sold",
  // Production stage
  "Production Ready": "Production",
  "Job Scheduled": "Production",
  "In Progress": "Production",
  "In Production": "Production",
  "Insurance Pending": "Production",
  "Insurance Pending/Cont Skipped": "Production",
  "Pre Production Supplementing": "Production",
  "Future Work": "Production",
  "Needs Rescheduling": "Production",
  "City / HOA Approval": "Production",
  // Invoicing stage
  Invoiced: "Invoicing",
  "Final Invoicing": "Invoicing",
  "Deductible Invoice Sent": "Invoicing",
  "Final Invoice Sent": "Invoicing",
  "Pending Final Payment": "Invoicing",
  "Job Close Out": "Invoicing",
  "Close Out In Progress": "Invoicing",
  "Project Review In Progress": "Invoicing",
  "Back End Job Audit": "Invoicing",
  // Completed stage
  "Paid & Closed": "Completed",
  "All Work Completed": "Completed",
  "All Work Complete": "Completed",
  "Work Completed Approved": "Completed",
  "Repair Completed Approved": "Completed",
  "Job Completed": "Completed",
  "Warranty Complete": "Completed",
};

// Status-to-status conversions using actual movement history when available.
export const STATUS_CONVERSIONS = [
  { from: "Lead", to: "Appointment Scheduled", label: "Lead → Appointment Scheduled" },
  { from: "Appointment Scheduled", to: "Appt Ran", label: "Appointment Scheduled → Appt Ran" },
  { from: "Appt Ran", to: "Estimating", label: "Appt Ran → Estimating" },
  { from: "Lead", to: "Estimating", label: "Lead → Estimating (Direct)" },
  { from: "Appointment Scheduled", to: "Estimating", label: "Appointment Scheduled → Estimating" },
  { from: "Appointment Scheduled", to: ["Lost", "Cold", "Dead", "Cold Lead", "No Damage"], label: "Appointment → Lost/Cold/No Damage" },
  { from: "Estimating", to: "Estimate Sent", label: "Estimating → Estimate Sent" },
  { from: "Estimate Sent", to: ["Sold Job", "Signed Contract"], label: "Estimate Sent → Sold" },
  { from: "Estimate Sent", to: ["Lost", "Cold", "Dead", "Cold Lead", "No Damage"], label: "Estimate Sent → Lost/Cold/No Damage" },
] as const;

// Full ordered status list for legacy tracking
export const ORDERED_STATUSES = [
  "Lead",
  "New",
  "Cold Lead",
  "Storm Alert",
  "Appointment Scheduled",
  "Adjuster Appt Scheduled",
  "Appt Ran",
  "Adjuster Appt Ran",
  "Estimating",
  "Estimate Sent",
  "Claim Review",
  "Scope Approval",
  "Waiting on Claim",
  "No Damage",
  "Sold Job",
  "Signed Contract",
  "Fully Approved",
  "Deductible Collected",
  "Production Ready",
  "Job Scheduled",
  "In Progress",
  "In Production",
  "Insurance Pending",
  "Insurance Pending/Cont Skipped",
  "Pre Production Supplementing",
  "Future Work",
  "Needs Rescheduling",
  "City / HOA Approval",
  "Invoiced",
  "Final Invoicing",
  "Deductible Invoice Sent",
  "Final Invoice Sent",
  "Pending Final Payment",
  "Job Close Out",
  "Close Out In Progress",
  "Project Review In Progress",
  "Back End Job Audit",
  "Paid & Closed",
  "All Work Completed",
  "All Work Complete",
  "Work Completed Approved",
  "Repair Completed Approved",
  "Job Completed",
  "Warranty Complete",
] as const;

// Loss/hold statuses, jobs that fall out of the pipeline
export const LOSS_STATUSES = ["Lost", "Dead", "Cold", "Cold Lead", "No Damage", "Internal Supplementing"] as const;

// Priority colors
export const PRIORITY_COLORS = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
} as const;

// Period options
export const PERIOD_OPTIONS = [
  { value: "week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "all", label: "All Time" },
] as const;

// Agent statuses
export const AGENT_STATUS_COLORS = {
  idle: { bg: "bg-green-500/20", text: "text-green-400", icon: "🟢" },
  active: { bg: "bg-yellow-500/20", text: "text-yellow-400", icon: "🟡" },
  sleeping: { bg: "bg-blue-500/20", text: "text-blue-400", icon: "💤" },
  error: { bg: "bg-red-500/20", text: "text-red-400", icon: "🔴" },
} as const;
