// Shared types for the admin/backlog triage UI.

/**
 * The only valid runtime values for an item's block_status field.
 * The DB column is TEXT (specforge migration 0105 added a CHECK constraint
 * after consumer #927 surfaced 7 legacy rows with block_status='open' that
 * the UI silently fell through to "Parked"). Consumers SHOULD pass values
 * through `normalizeBlockStatus()` before rendering — it coerces any
 * unrecognized value to `null` so a future schema-drift bug can't
 * masquerade as a stuck Parked state.
 */
export type BlockStatus = "parked" | "blocked" | null;

/**
 * Narrow an unknown runtime `block_status` to the valid contract. Anything
 * outside {'parked','blocked'} (including 'open', '', undefined, or a future
 * unknown value) becomes `null`. Used by BlockStrip + BacklogCard so the UI
 * doesn't fall through to a misleading "Parked" label.
 */
export function normalizeBlockStatus(v: unknown): BlockStatus {
  if (v === "parked" || v === "blocked") return v;
  return null;
}

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
  /** #1077 — current assignee (the user who owns the work). NULL when
   *  no one is explicitly assigned; lane-based routing still applies. */
  assigneeUserId: string | null;
  /** #1077 — handle-or-role label for the assignee, composed server-side
   *  by the consumer's enrichment shim. Null when assigneeUserId is null
   *  or when the user can't be resolved. */
  assigneeLabel: string | null;
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

// #1068 — 'compliance_hold' added for the compliance-hold-via-backlog
// flow. Holds are filed by the engine when a pending_review rule fires
// on a signup/profile/provision evaluation; counsel reviews them via
// the existing /admin/backlog triage UI.
export type KindFilter = "all" | "bug" | "feedback" | "idea" | "contributor_signup" | "customer_signup" | "compliance_hold";

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
