// Shared types for the admin/backlog triage UI.

export type DecisionOption = { value: string; label: string; detail?: string };

export type Item = {
  id: string;
  seq: number;
  kind: "bug" | "feedback" | "idea" | "feature" | "contributor_signup" | "customer_signup" | (string & {});
  title: string | null;
  description: string;
  pageUrl: string | null;
  state:
    | "pending"
    | "accepted"
    | "ready_to_ship"
    | "shipped"
    | "requested"
    | "provisioned"
    | "declined"
    | "duplicate";
  priority: number | null;
  summary: string | null;
  triageReasoning: string | null;
  triagedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceBugReportId: string | null;
  reporterEmail: string | null;
  reporterDisplayName: string | null;
  reporterHandle: string | null;
  /** Handle-or-role label composed server-side. Never falls through to displayName / email. */
  reporterLabel: string;
  decisionOptions: DecisionOption[] | null;
  decisionChoice: string | null;
  decisionChosenAt: string | null;
  shipApprovedAt: string | null;
  shipApprovedByUserId: string | null;
  context: Record<string, unknown> | null;
  duplicateOfIntakeItemId: string | null;
  duplicateOfSeq: number | null;
  duplicateOfTitle: string | null;
  duplicateOfState: Item["state"] | null;
  blockStatus: "parked" | "blocked" | null;
  blockedByIntakeItemId: string | null;
  blockedBySeq: number | null;
  blockedByTitle: string | null;
  blockedByState: Item["state"] | null;
  category: string | null;
  createdInSessionId: string | null;
  createdInSessionDisplayName: string | null;
  comments: TicketComment[];
};

export type TicketComment = {
  id: string;
  authorUserId: string | null;
  authorLabel: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

export type StateFilter =
  | "all"
  | "active"
  | "pending"
  | "accepted"
  | "ready_to_ship"
  | "shipped"
  | "parked"
  | "blocked"
  | "requested"
  | "provisioned"
  | "declined"
  | "duplicate";

export type KindFilter = "all" | "bug" | "feedback" | "idea" | "contributor_signup" | "customer_signup";

export type SortMode = "default" | "priority" | "newest" | "oldest" | "recent";

export type HasFilter = null | "yes" | "no";

export type HistoryEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
  actorHandle: string | null;
  actorDomainRole: string | null;
  actorSystemRole: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  at: string;
};
