export type WorkspaceKey =
  | "speed_to_lead"
  | "insurance"
  | "sales_follow_up"
  | "general";

export interface InboxRow {
  contactJnid: string;
  jobJnid: string | null;
  name: string;
  street: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  statusOrder: number;
  salesRep: string | null;
  campaign: string | null;
  lastAt: string | null;
  preview: string;
  channel: string;
  direction: string | null;
  line: string | null;
  sender: string | null;
  unread: boolean;
  unresponded: boolean;
  jobUrl: string | null;
}

export interface WorkspaceSummary {
  key: WorkspaceKey;
  label: string;
  count: number;
  attentionCount: number;
}

export interface InboxResponse {
  workspaces: WorkspaceSummary[];
  rows: InboxRow[];
  columns: Array<{ status: string; order: number; count: number }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  warnings: Array<{ source: string; message: string }>;
}

export type ConversationItemType =
  | "text"
  | "call"
  | "email"
  | "note"
  | "activity"
  | "system";

export interface ConversationItem {
  id: string;
  type: ConversationItemType;
  direction: "inbound" | "outbound" | "internal";
  deliveryStatus: string | null;
  occurredAt: string;
  channel: string;
  line: string | null;
  sender: string | null;
  preview: string;
  body: string | null;
  durationSeconds?: number | null;
  systemEvent?: {
    kind:
      | "campaign_launched"
      | "campaign_completed"
      | "workspace_moved"
      | "status_changed";
    actor: string | null;
    disposition?: string | null;
  };
}

export interface WorkspaceConfigurationDraft {
  workspace: WorkspaceKey;
  businessHours?: {
    timeZone: string;
    days: number[];
    start: string;
    end: string;
  };
}

export interface WorkflowDefinitionDraft {
  name: string;
  trigger: { type: string; config: Record<string, unknown> };
  filters: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<
    | { type: "move_column"; status: string }
    | { type: "launch_campaign"; campaignId: string }
    | { type: "set_disposition"; disposition: string }
  >;
}
