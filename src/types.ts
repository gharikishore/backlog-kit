// Public types (scaffolding for #955; canonical surface per the spec
// in specforge:docs/backlog-kit-spec.md). Implementation details land
// in #956-#959.

export type IntakeState =
  | "pending"
  | "accepted"
  | "ready_to_ship"
  | "shipped"
  | "declined"
  | "duplicate";

export type BlockStatus = "parked" | "blocked";

/**
 * Minimum user shape the kit's auth + audit integration needs. Real
 * consumer types extend this; the kit treats users opaquely except for
 * id + email + admin-check.
 */
export interface KitUser {
  id: string;
  email: string;
  publicHandle?: string | null;
  displayName?: string | null;
}

/**
 * Minimum intake row shape. Consumer schemas extend with project-specific
 * columns (context, kind, page_url, etc.) that the kit treats opaquely.
 */
export interface IntakeRow {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  category: string;
  kind: string;
  state: IntakeState;
  priority: number | null;
  pageUrl: string | null;
  reporterUserId: string | null;
  parentIntakeItemId: string | null;
  blockedByIntakeItemId: string | null;
  blockStatus: BlockStatus | null;
  shipApprovedAt: Date | null;
  shipApprovedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentRow {
  id: string;
  intakeItemId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface TriageUpdates {
  state?: IntakeState;
  category?: string;
  priority?: number | null;
  pageUrl?: string | null;
  parentIntakeItemId?: string | null;
  blockedByIntakeItemId?: string | null;
  blockStatus?: BlockStatus | null;
  triageReasoning?: string | null;
  summary?: string | null;
}

/**
 * Configuration passed to createBacklog(). See spec section 2 for full
 * documentation of each field.
 */
export interface BacklogConfig<
  U extends KitUser = KitUser,
  Category extends string = string,
  Kind extends string = string,
> {
  // Schema pluggability
  tableNames: {
    intakeItems: string;
    auditLog: string;
    intakeComments?: string;
  };

  // Enum vocabulary
  categories: readonly Category[];
  kinds: readonly Kind[];

  // Auth / user model
  sessionResolver: () => Promise<U | null>;
  isAdmin: (user: U) => boolean;
  userById: (id: string) => Promise<U | null>;

  // Audit integration
  auditWriter: (entry: BacklogAuditEntry) => Promise<void>;

  // Optional session-tracking integration
  sessionContext?: {
    currentSessionId: () => Promise<string | null>;
    logActivity: (activity: SessionActivity) => Promise<void>;
  };

  // Optional SSE plumbing
  sseBroadcast?: (event: BacklogEvent) => Promise<void>;

  // Optional theme tokens
  theme?: BacklogTheme;

  // Behavior flags
  shipGateRequired?: boolean;   // default true
  metaDualWrite?: boolean;       // default true (parent + blocked_by during #647 transition)
}

export interface BacklogAuditEntry {
  actorUserId: string | null;
  impersonatedByUserId: string | null;
  action: string;          // e.g. "intake.filed", "intake.triaged", "intake.shipped"
  targetTable: string;     // typically "intake_items"
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface SessionActivity {
  kind: string;
  title: string;
  refTable?: string | null;
  refId?: string | null;
  state?: string;
  metadata?: Record<string, unknown>;
}

export interface BacklogEvent {
  kind: "intake.filed" | "intake.triaged" | "intake.shipped" | "comment.added" | string;
  intakeId?: string;
  payload?: Record<string, unknown>;
}

export interface BacklogTheme {
  cardBg?: string;
  cardBorder?: string;
  asideBg?: string;
  inkPrimary?: string;
  inkMuted?: string;
  pendingTone?: string;
  acceptedTone?: string;
  readyToShipTone?: string;
  shippedTone?: string;
  declinedTone?: string;
  duplicateTone?: string;
  fontSans?: string;
  fontMono?: string;
}

/**
 * Returned by createBacklog(). The full toolkit a consumer wires into
 * their routes, components, and audit calls. See spec section 5.
 */
export interface BacklogKit<
  U extends KitUser = KitUser,
  Category extends string = string,
  Kind extends string = string,
> {
  // Filing
  fileIntake: (input: FileIntakeInput<Category, Kind>) => Promise<IntakeRow>;

  // Triage
  triageIntake: (id: string, updates: TriageUpdates) => Promise<IntakeRow>;

  // State transitions
  transitionState: (id: string, to: IntakeState) => Promise<IntakeRow>;

  // Ship gate
  shipBatch: (seqs: number[]) => Promise<{ shipped: number[]; missing: number[] }>;
  checkShipGate: (seqs: number[]) => Promise<{ approved: number[]; missing: number[] }>;

  // Query
  queryAccepted: (opts?: QueryOptions) => Promise<IntakeRow[]>;
  queryByState: (state: IntakeState, opts?: QueryOptions) => Promise<IntakeRow[]>;
  pickNext: () => Promise<IntakeRow | null>;
  getById: (id: string) => Promise<IntakeRow | null>;
  getBySeq: (seq: number) => Promise<IntakeRow | null>;
  getChildren: (parentId: string) => Promise<IntakeRow[]>;
  getLogicalNext: (intakeId: string) => Promise<IntakeRow[]>;

  // Comments
  addComment: (intakeId: string, body: string) => Promise<CommentRow>;
  getComments: (intakeId: string) => Promise<CommentRow[]>;

  // Internal
  _config: BacklogConfig<U, Category, Kind>;
}

export interface FileIntakeInput<Category extends string = string, Kind extends string = string> {
  title: string;
  description?: string | null;
  category: Category;
  kind: Kind;
  priority?: number | null;
  pageUrl?: string | null;
  parentIntakeItemId?: string | null;
  blockedByIntakeItemId?: string | null;
  reporterUserId?: string | null;
}

export interface QueryOptions {
  limit?: number;
  category?: string;
  kind?: string;
}
