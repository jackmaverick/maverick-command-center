import type { WorkspaceKey } from "./types";

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  speed_to_lead: "Speed to Lead",
  insurance: "Insurance",
  sales_follow_up: "Sales Follow-up",
  general: "General",
};

export const SPEED_TO_LEAD_STATUSES = [
  "Lead",
  "Contacting",
  "Appt Prep",
  "Appointment Scheduled",
  "Needs Rescheduling",
  "Appt Ran",
  "Estimating",
] as const;

export const SALES_FOLLOW_UP_STATUSES = [
  "Estimate Sent",
  "Project Review In Progress",
  "Sold Job",
] as const;

export const INSURANCE_STATUSES = [
  "Lead",
  "Contacting",
  "Appt Prep",
  "Appointment Scheduled",
  "Storm Alert",
  "Storm Inspection Scheduled",
  "Needs Rescheduling",
  "Appt Ran",
  "Undecided on Filing A Claim",
  "Claim # Needed",
  "Filing A Claim",
  "Adjuster Appt Scheduled",
  "Adjuster Appt Ran",
  "Waiting on Claim",
  "Claim Review",
  "Response Denial",
  "Claim Denied",
  "Pre Production Supplementing",
  "Colors & Scope Approval",
  "City / HOA Approval",
  "Material & WO Approval",
  "Job Scheduled",
  "In Production",
  "Work Completed Approved",
  "Deductible Invoice Sent",
  "Deductible Collected",
  "Final Invoice Sent",
  "Final Claim / Invoice Reconciliation",
  "Pending Final Payment",
  "Job Close Out",
  "Future Work",
  "Lost",
] as const;

export function statusesForWorkspace(workspace: WorkspaceKey): string[] {
  if (workspace === "speed_to_lead") return [...SPEED_TO_LEAD_STATUSES];
  if (workspace === "sales_follow_up") return [...SALES_FOLLOW_UP_STATUSES];
  if (workspace === "insurance") return [...INSURANCE_STATUSES];
  return [];
}
