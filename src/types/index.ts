import type { Segment, Stage } from "@/lib/constants";

// Dashboard KPIs
export interface DashboardMetrics {
  revenue: number;
  pipelineValue: number;
  newLeads: number;
  conversionRate: number;
  avgTicket: number;
  revenueDelta: number | null;
  leadsDelta: number | null;
  salesFunnel: { name: string; value: number; fill: string }[];
  revenueByJobType: Record<string, number>;
  topLeadSources: { name: string; count: number }[];
  recentActivity: Activity[];
  pipelineByJobType: Record<string, number>;
}

// JN Synced Entities
export interface JnJob {
  id: string;
  number: string | null;
  record_type_name: string | null;
  status_name: string | null;
  stage: Stage | null;
  sales_rep_id: string | null;
  primary_contact_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  approved_estimate_total: number;
  approved_invoice_total: number;
  date_created: string;
  date_updated: string | null;
  is_active: boolean;
  is_won: boolean;
  is_closed: boolean;
  is_lost: boolean;
  lead_source: string | null;
  custom_fields: Record<string, unknown>;
  segment: Segment | null;
  synced_at: string;
}

export interface JnContact {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  home_phone: string | null;
  mobile_phone: string | null;
  city: string | null;
  state: string | null;
  contact_type: string | null;
  lead_source: string | null;
  sales_rep_id: string | null;
  is_active: boolean;
  date_created: string;
}

export interface JnSalesRep {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
}

export interface JnEstimate {
  id: string;
  job_id: string | null;
  contact_id: string | null;
  status_name: string | null;
  total: number;
  date_created: string;
}

export interface JnInvoice {
  id: string;
  job_id: string | null;
  contact_id: string | null;
  status_name: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  date_created: string;
  date_due: string | null;
}

export interface JnPayment {
  id: string;
  job_id: string | null;
  contact_id: string | null;
  amount: number;
  status: string | null;
  date_payment: string;
}

export interface JnStatusHistory {
  id: string;
  job_id: string;
  status_name: string;
  stage: string | null;
  changed_at: string;
}

// Activity (merged from JN + internal)
export interface Activity {
  id: string;
  type: string;
  subject: string | null;
  description: string | null;
  contact_id: string | null;
  job_id: string | null;
  date_created: string;
  source: "jn" | "internal";
}

// Pipeline metrics
export interface PipelineMetrics {
  activeJobs: number;
  wonJobs: number;
  lostJobs: number;
  totalJobs: number;
  overallConversion: number;
  avgCycleTime: number;
  ytdRevenue: number;
  stageCounts: Record<string, number>;
  conversions: Record<string, number>;
  lossRates: Record<string, number>;
  keyConversions: Record<string, number>;
}

// Segment metrics
export interface SegmentMetrics extends PipelineMetrics {
  segment: Segment;
  companyAvgConversion: number;
  repPerformance: RepSegmentMetrics[];
  lossAnalysis: { stage: string; count: number; rate: number }[];
  speedMetrics: { from: string; to: string; avgDays: number }[];
  revenue: number;
  avgTicket: number;
  pipelineValue: number;
}

// Sales rep metrics
export interface RepMetrics {
  repId: string;
  repName: string;
  totalJobs: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  avgCycleDays: number;
  revenue: number;
  segmentCloseRates: Record<Segment, number>;
  statusConversions: StatusConversion[];
  followUpMetrics: FollowUpMetrics;
  timeBetweenStatuses: TimeBetweenStatus[];
}

export interface RepSegmentMetrics {
  repId: string;
  repName: string;
  totalJobs: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  avgCycleDays: number;
  revenue: number;
}

// Status-by-status conversion (every status, not just stages)
export interface StatusConversion {
  fromStatus: string;
  toStatus: string;
  jobCount: number;
  conversionRate: number;
  avgDays: number;
}

// Follow-up tracking
export interface FollowUpMetrics {
  avgAfterEstimate: number;
  avgAfterAppointment: number;
  jobsWithZeroFollowUp: number;
  wonAvgFollowUps: number;
  lostAvgFollowUps: number;
  avgDaysToFirstFollowUp: number;
}

export interface TimeBetweenStatus {
  fromStatus: string;
  toStatus: string;
  avgDays: number;
}

// Lead source metrics
export interface LeadSourceMetrics {
  source: string;
  leads: number;
  won: number;
  lost: number;
  closeRate: number;
  revenue: number;
  avgTicket: number;
  segmentBreakdown: Record<Segment, number>;
  conversionFunnel: StatusConversion[];
}

// Speed to lead
export interface SpeedToLeadMetrics {
  avgResponseMinutes: number;
  respondedUnder5Min: number;
  missedPercent: number;
  avgLeadToClose: number;
  responseDistribution: { bucket: string; count: number; percent: number }[];
  repResponseTimes: {
    repId: string;
    repName: string;
    avgMinutes: number;
    under5MinPercent: number;
    missedPercent: number;
    callsToday: number;
  }[];
  transitions: StatusConversion[];
}

// Weekly snapshots
export interface WeeklySnapshot {
  id: string;
  week_start: string;
  week_end: string;
  snapshot_type: "weekly" | "monthly";
  metrics: SnapshotMetrics;
  created_at: string;
}

export interface SnapshotMetrics {
  period: { start: string; end: string; type: string };
  revenue: number;
  newLeads: number;
  jobsWon: number;
  jobsLost: number;
  closeRate: number;
  avgTicket: number;
  pipelineValue: number;
  avgResponseTimeMinutes: number | null;
  segments: Record<
    Segment,
    {
      leads: number;
      won: number;
      lost: number;
      closeRate: number;
      revenue: number;
    }
  >;
  reps: Record<
    string,
    {
      name: string;
      leads: number;
      won: number;
      closeRate: number;
      revenue: number;
      avgResponseMin: number | null;
    }
  >;
  leadSources: Record<string, { leads: number; won: number; revenue: number }>;
  followUps: {
    avgAfterEstimate: number;
    avgAfterAppointment: number;
    jobsWithZeroFollowup: number;
  };
}

// Agent types (from Command Center)
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "active" | "sleeping" | "error";
  current_task_id: string | null;
  session_key: string | null;
  last_heartbeat: string | null;
  next_wake_at: string | null;
  soul_file: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Heartbeat {
  id: string;
  agent_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed" | "skipped";
  tasks_processed: number;
  summary: string | null;
}
