import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Unified intake table for the internal backlog system. Captures three kinds
// of incoming items in one place so the admin can triage + prioritize them
// against each other:
//   - 'bug'      — captured by the floating Report-a-bug widget. May reference
//                  a bug_reports row (the existing Phase ~5 table is kept for
//                  the screenshot + page context — intake_items pulls
//                  description + title into the triage flow).
//   - 'feedback' — captured by a new "Send feedback" entry: friction reports,
//                  copy nits, UX confusion. Lighter shape than bug.
//   - 'idea'     — proactive feature ideas. Admin-only entry.
//
// Triage state machine:
//   pending → accepted (with triage_reasoning + priority) → ready_to_ship → shipped
//   pending → declined (with triage_reasoning)
//   pending → duplicate (with metadata.duplicateOf pointer)
//
// Only system_role='admin' can change state or set priority — enforced at
// the API layer (POST /api/admin/backlog/[id]).
//
// SHARED-PACKAGE NOTE: user-FK references are intentionally omitted here so
// the schema doesn't depend on a consumer-specific `users` table. The DB-level
// constraints still exist (each consumer applies migrations that include the
// FK + onDelete behavior). Drizzle TS queries don't need the `.references()`
// declaration to function; it only matters for `drizzle-kit generate`, which
// the consumer wraps with its own users-aware schema if needed.
export const intakeItems = pgTable(
  "intake_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: integer("seq").notNull().default(sql`nextval('intake_items_seq_seq')`),
    kind: text("kind").notNull(),  // 'bug' | 'feedback' | 'idea'
    sourceBugReportId: uuid("source_bug_report_id"),
    title: text("title"),
    description: text("description").notNull(),
    pageUrl: text("page_url"),
    context: jsonb("context"),
    reporterUserId: uuid("reporter_user_id"),
    state: text("state").notNull().default("pending"),
    summary: text("summary"),
    triageReasoning: text("triage_reasoning"),
    priority: integer("priority"),
    triagedByUserId: uuid("triaged_by_user_id"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    decisionOptions: jsonb("decision_options"),
    decisionChoice: text("decision_choice"),
    decisionChosenAt: timestamp("decision_chosen_at", { withTimezone: true }),
    decisionChosenByUserId: uuid("decision_chosen_by_user_id"),
    shipApprovedAt: timestamp("ship_approved_at", { withTimezone: true }),
    shipApprovedByUserId: uuid("ship_approved_by_user_id"),
    duplicateOfIntakeItemId: uuid("duplicate_of_intake_item_id"),
    blockStatus: text("block_status"),
    blockedByIntakeItemId: uuid("blocked_by_intake_item_id"),
    parentIntakeItemId: uuid("parent_intake_item_id"),
    category: text("category"),
    parkedAt: timestamp("parked_at", { withTimezone: true }),
    pointsAwardedAt: timestamp("points_awarded_at", { withTimezone: true }),
    // #1076 — collaborative-triage foundation. assignee_user_id names
    // the person who currently owns the work on this intake. NULL = no
    // explicit assignee (lane/category filtering still routes the work).
    // FK is at the DB level only — see "SHARED-PACKAGE NOTE" above for
    // why the Drizzle column intentionally has no .references() call.
    assigneeUserId: uuid("assignee_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("intake_items_kind_idx").on(t.kind),
    stateIdx: index("intake_items_state_idx").on(t.state),
    reporterIdx: index("intake_items_reporter_idx").on(t.reporterUserId),
    priorityIdx: index("intake_items_priority_idx").on(t.priority),
    createdAtIdx: index("intake_items_created_at_idx").on(t.createdAt),
    duplicateOfIdx: index("intake_items_duplicate_of_idx").on(t.duplicateOfIntakeItemId),
    blockStatusIdx: index("intake_items_block_status_idx").on(t.blockStatus),
    blockedByIdx: index("intake_items_blocked_by_idx").on(t.blockedByIntakeItemId),
    parentIntakeItemIdx: index("intake_items_parent_intake_item_id_idx").on(t.parentIntakeItemId),
    categoryIdx: index("intake_items_category_idx").on(t.category),
    parkedAtIdx: index("intake_items_parked_at_idx").on(t.parkedAt),
    // #1076 — drives the "Assigned to me" filter on /admin/backlog and
    // the per-user "my queue" view planned in #1078.
    assigneeIdx: index("intake_items_assignee_idx").on(t.assigneeUserId),
    seqUnique: uniqueIndex("intake_items_seq_unique").on(t.seq),
  })
);

export type IntakeItem = typeof intakeItems.$inferSelect;
export type NewIntakeItem = typeof intakeItems.$inferInsert;

// Chronological admin discussion thread on a ticket.
export const intakeItemComments = pgTable(
  "intake_item_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (t) => ({
    threadIdx: index("intake_item_comments_thread_idx").on(t.intakeItemId, t.createdAt),
    authorIdx: index("intake_item_comments_author_idx").on(t.authorUserId, t.createdAt),
  })
);

export type IntakeItemComment = typeof intakeItemComments.$inferSelect;
export type NewIntakeItemComment = typeof intakeItemComments.$inferInsert;

// Free-form "related tickets" links between intake_items.
export const intakeItemLinks = pgTable(
  "intake_item_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromIntakeItemId: uuid("from_intake_item_id").notNull().references(() => intakeItems.id, { onDelete: "cascade" }),
    toIntakeItemId: uuid("to_intake_item_id").notNull().references(() => intakeItems.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index("intake_item_links_from_idx").on(t.fromIntakeItemId),
    toIdx: index("intake_item_links_to_idx").on(t.toIntakeItemId),
  })
);

export type IntakeItemLink = typeof intakeItemLinks.$inferSelect;
export type NewIntakeItemLink = typeof intakeItemLinks.$inferInsert;

// #1076 — collaborative-triage foundation. Watchers are users who get
// notified on activity (state change, comment, mention) but DO NOT own
// the work — that's the assignee. UNIQUE (intake_item_id, user_id)
// prevents the same user from being added twice as a watcher.
export const intakeItemWatchers = pgTable(
  "intake_item_watchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedByUserId: uuid("added_by_user_id"),
  },
  (t) => ({
    intakeIdx: index("intake_item_watchers_intake_idx").on(t.intakeItemId),
    userIdx: index("intake_item_watchers_user_idx").on(t.userId),
    intakeUserUnique: uniqueIndex("intake_item_watchers_intake_user_unique").on(t.intakeItemId, t.userId),
  })
);

export type IntakeItemWatcher = typeof intakeItemWatchers.$inferSelect;
export type NewIntakeItemWatcher = typeof intakeItemWatchers.$inferInsert;

// Post-creation attachments on backlog tickets. R2 migration completed
// in intake #845 — `data_url` is now a content-addressable R2 key like
// `screenshots/sha256/<hex>.png`, not a base64 string.
export const intakeItemAttachments = pgTable(
  "intake_item_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    dataUrl: text("data_url").notNull(),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index("intake_item_attachments_item_idx").on(t.intakeItemId, t.createdAt),
  })
);

export type IntakeItemAttachment = typeof intakeItemAttachments.$inferSelect;
export type NewIntakeItemAttachment = typeof intakeItemAttachments.$inferInsert;
