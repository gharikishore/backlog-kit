// Drizzle schemas for the feedback/triage tables.
//
// Tables exported:
//   intake.ts          — intakeItems, intakeItemComments, intakeItemLinks, intakeItemAttachments
//   errors.ts          — bugReports, systemErrors
//   audit.ts           — auditLog
//   agent-sessions.ts  — agentSessions, agentSessionActivities, agentSessionDependencies
//
// Each consumer barrels these into its own `src/db/schema/index.ts`
// re-export chain. Migrations live in /migrations and are applied
// per-consumer against the consumer's own Postgres.
export * from "./intake";
export * from "./errors";
export * from "./audit";
export * from "./agent-sessions";
