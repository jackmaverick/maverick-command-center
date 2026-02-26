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
export const SEGMENTS = {
  real_estate: { label: "Real Estate", color: "#a371f7", icon: "🏠" },
  retail: { label: "Retail", color: "#58a6ff", icon: "🏗️" },
  insurance: { label: "Insurance", color: "#d29922", icon: "🛡️" },
  repairs: { label: "Repairs", color: "#3fb950", icon: "🔧" },
} as const;

export type Segment = keyof typeof SEGMENTS;

// Pipeline stage definitions (mapped from JN statuses)
export const STAGES = [
  "Lead",
  "Estimating",
  "Sold",
  "Production",
  "Invoicing",
  "Completed",
] as const;

export type Stage = (typeof STAGES)[number];

// JN status → stage mapping (matched to actual Maverick Exteriors statuses)
export const STATUS_TO_STAGE: Record<string, Stage> = {
  // Lead stage
  Lead: "Lead",
  New: "Lead",
  "Cold Lead": "Lead",
  Cold: "Lead",
  "Appointment Scheduled": "Lead",
  // Estimating stage
  Estimating: "Estimating",
  "Estimate Sent": "Estimating",
  // Sold stage
  "Signed Contract": "Sold",
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
  "Job Completed": "Completed",
  "Warranty Complete": "Completed",
};

// Full ordered status list for conversion tracking
export const ORDERED_STATUSES = [
  "Lead",
  "Cold Lead",
  "Appointment Scheduled",
  "Estimating",
  "Estimate Sent",
  "Signed Contract",
  "Sold Job",
  "Production Ready",
  "In Progress",
  "Final Invoicing",
  "Pending Final Payment",
  "Paid & Closed",
] as const;

// Loss/hold statuses
export const LOSS_STATUSES = ["Lost", "Dead", "Internal Supplementing"] as const;

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
