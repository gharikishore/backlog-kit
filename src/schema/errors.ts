import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// User-submitted bug reports. Captured via the floating "Report a bug" modal.
// `reporterUserId` is nullable — users hitting auth bugs may not be signed in.
// `screenshotDataUrl` holds a content-addressable R2 key (intake #845) like
// `screenshots/sha256/<hex>.png`, not a base64 data URL — column name retained
// for migration compatibility.
//
// SHARED-PACKAGE NOTE: user-FK references omitted; DB-level constraints stay.
export const bugReports = pgTable(
  "bug_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id"),
    description: text("description").notNull(),
    pageUrl: text("page_url").notNull(),
    viewportW: integer("viewport_w"),
    viewportH: integer("viewport_h"),
    userAgent: text("user_agent"),
    screenshotDataUrl: text("screenshot_data_url"),
    context: jsonb("context"),
    status: text("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reporterIdx: index("bug_reports_reporter_idx").on(t.reporterUserId),
    statusIdx: index("bug_reports_status_idx").on(t.status),
    createdAtIdx: index("bug_reports_created_at_idx").on(t.createdAt),
  })
);

// Auto-captured exceptions. Both client (window.onerror, unhandledrejection,
// React error boundaries) and server (Next instrumentation onRequestError, API
// route try/catch) feed in here.
//
// fingerprint groups identical errors: sha-256(name|message|first-stack-frame).
// 60-day TTL purge via cron — see intake #847.
export const systemErrors = pgTable(
  "system_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    errorName: text("error_name"),
    errorMessage: text("error_message").notNull(),
    stack: text("stack"),
    fingerprint: text("fingerprint").notNull(),
    pageUrl: text("page_url"),
    method: text("method"),
    endpoint: text("endpoint"),
    statusCode: integer("status_code"),
    userId: uuid("user_id"),
    context: jsonb("context"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
  },
  (t) => ({
    sourceIdx: index("system_errors_source_idx").on(t.source),
    fingerprintIdx: index("system_errors_fingerprint_idx").on(t.fingerprint),
    occurredAtIdx: index("system_errors_occurred_at_idx").on(t.occurredAt),
    userIdx: index("system_errors_user_idx").on(t.userId),
  })
);

export type BugReport = typeof bugReports.$inferSelect;
export type NewBugReport = typeof bugReports.$inferInsert;
export type SystemError = typeof systemErrors.$inferSelect;
export type NewSystemError = typeof systemErrors.$inferInsert;
