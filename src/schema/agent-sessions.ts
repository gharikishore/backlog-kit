import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Session-tracking schema (intake #230, parent #228). Three tables for
// the parallel-Claude-session UI. Spec at docs/session-tracking-app-spec.md
// (lives in the specforge consumer).
//
// Naming: `agent_sessions` prefix avoids collision with Supabase auth's
// `sessions`. The agent_ prefix also reads cleanly in cross-table joins.
//
// SHARED-PACKAGE NOTE: no user-FK refs needed — sessions self-reference only.

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchName: text("branch_name").notNull(),
    displayName: text("display_name").notNull(),
    purpose: text("purpose").notNull(),
    state: text("state").notNull().default("active"),
    contextEstimatePct: integer("context_estimate_pct"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    pinned: boolean("pinned").notNull().default(false),
    metadata: jsonb("metadata"),
  },
  (t) => ({
    stateIdx: index("agent_sessions_state_idx").on(t.state),
    purposeIdx: index("agent_sessions_purpose_idx").on(t.purpose),
    branchActiveIdx: index("agent_sessions_branch_active_idx").on(t.branchName, t.lastActiveAt),
  })
);

export const agentSessionActivities = pgTable(
  "agent_session_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => agentSessions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    title: text("title").notNull(),
    body: text("body"),
    priority: integer("priority"),
    state: text("state").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (t) => ({
    sessionIdx: index("agent_session_activities_session_idx").on(t.sessionId, t.createdAt),
    openIdx: index("agent_session_activities_open_idx").on(t.sessionId, t.priority, t.createdAt),
    refIdx: index("agent_session_activities_ref_idx").on(t.refTable, t.refId),
  })
);

export const agentSessionDependencies = pgTable(
  "agent_session_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromSessionId: uuid("from_session_id").notNull().references(() => agentSessions.id, { onDelete: "cascade" }),
    toSessionId: uuid("to_session_id").notNull().references(() => agentSessions.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    state: text("state").notNull().default("waiting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (t) => ({
    fromIdx: index("agent_session_dependencies_from_idx").on(t.fromSessionId),
    toIdx: index("agent_session_dependencies_to_idx").on(t.toSessionId),
    waitingIdx: index("agent_session_dependencies_waiting_idx").on(t.fromSessionId, t.toSessionId),
  })
);

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type AgentSessionActivity = typeof agentSessionActivities.$inferSelect;
export type NewAgentSessionActivity = typeof agentSessionActivities.$inferInsert;
export type AgentSessionDependency = typeof agentSessionDependencies.$inferSelect;
export type NewAgentSessionDependency = typeof agentSessionDependencies.$inferInsert;
