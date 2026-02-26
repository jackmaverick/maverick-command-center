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

// Pipeline stage definitions (kept for backward compatibility with sales funnel)
export const STAGES = [
  "Lead",
  "Appointment Scheduled",
  "Estimating",
  "Sold",
  "Production",
  "Invoicing",
  "Completed",
] as const;

export type Stage = (typeof STAGES)[number];

// JN status → stage mapping (DEPRECATED for conversion tracking, use STATUS_CONVERSIONS instead)
export const STATUS_TO_STAGE: Record<string, Stage> = {
  // Lead stage
  Lead: "Lead",
  New: "Lead",
  "Cold Lead": "Lead",
  Cold: "Lead",
  "Appointment Scheduled": "Appointment Scheduled",
  // Estimating stage
  Estimating: "Estimating",
  "Estimate Sent": "Estimating",
  // Sold stage
  "Sold Job": "Sold",
  // Production stage
  "Production Ready": "Production",
  "In Progress": "Production",
  "Insurance Pending": "Production",
  "Future Work": "Production",
  "Needs Rescheduling": "Production",
  // Invoicing stage
  Invoiced: "Invoicing",
  "Final Invoicing": "Invoicing",
  "Pending Final Payment": "Invoicing",
  "Job Close Out": "Invoicing",
  // Completed stage
  "Paid & Closed": "Completed",
  "All Work Completed": "Completed",
  "All Work Complete": "Completed",
  "Job Completed": "Completed",
  "Warranty Complete": "Completed",
};

// Status-to-Status Conversions (actual pipeline flow)
// These define the real conversion funnel you care about
export const STATUS_CONVERSIONS = [
  { from: "Lead", to: "Appointment Scheduled", label: "Lead → Appointment" },
  { from: "Lead", to: "Estimating", label: "Lead → Estimating (Direct)" },
  { from: "Appointment Scheduled", to: "Estimating", label: "Appointment → Estimating" },
  { from: "Appointment Scheduled", to: ["Lost", "Cold", "Dead", "Cold Lead"], label: "Appointment → Lost/Cold/Dead" },
  { from: "Estimating", to: "Estimate Sent", label: "Estimating → Estimate Sent" },
  { from: "Estimate Sent", to: "Sold Job", label: "Estimate Sent → Sold Job" },
  { from: "Estimate Sent", to: ["Lost", "Cold", "Dead", "Cold Lead"], label: "Estimate Sent → Lost/Cold/Dead" },
] as const;

// Full ordered status list for legacy tracking
export const ORDERED_STATUSES = [
  "Lead",
  "New",
  "Cold Lead",
  "Appointment Scheduled",
  "Estimating",
  "Estimate Sent",
  "Sold Job",
  "Production Ready",
  "In Progress",
  "Insurance Pending",
  "Future Work",
  "Needs Rescheduling",
  "Invoiced",
  "Final Invoicing",
  "Pending Final Payment",
  "Job Close Out",
  "Paid & Closed",
  "All Work Completed",
  "All Work Complete",
  "Job Completed",
  "Warranty Complete",
] as const;

// Loss/hold statuses (jobs that fall out of the pipeline)
export const LOSS_STATUSES = ["Lost", "Dead", "Cold", "Cold Lead", "Internal Supplementing"] as const;

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
